// Background service worker - handles link checking and communication
class DevKitLinkChecker {
    constructor() {
        this.tabData = new Map(); // Store data per tab
        this.currentScanController = null; // Track current scan for cancellation
        
        // Sites known to return 403 for HEAD requests from extensions
        this.sites403Prone = [
            'twitter.com',
            'x.com',
            'facebook.com',
            'linkedin.com',
            'instagram.com',
            't.co'
        ];
        
        this.setupMessageListeners();
        this.setupTabListeners();
    }
    
    setupMessageListeners() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true; // Keep message channel open for async responses
        });
    }
    
    setupTabListeners() {
        // Clean up data when tabs are closed
        chrome.tabs.onRemoved.addListener((tabId) => {
            this.tabData.delete(tabId);
        });
        
        // Clean up data when navigating to a new page
        chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
            if (changeInfo.url) {
                this.tabData.delete(tabId);
            }
        });
    }
    
    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.action) {
                case 'scanLinks':
                    await this.scanLinks(message.tabId, sendResponse);
                    break;
                case 'checkLinks':
                    await this.checkLinks(message.tabId, message.links, sendResponse);
                    break;
                case 'getTabData':
                    this.getTabData(message.tabId, sendResponse);
                    break;
                case 'scanAndCheckDomain':
                    // Get the tab ID from the sender (the plugin-scan page)
                    const progressTabId = sender.tab ? sender.tab.id : null;
                    await this.scanAndCheckDomain(message.target, sendResponse, message.mode, message.debug, message.maxDepth, message.scanPagesOnly, progressTabId);
                    break;
                case 'cancelScan':
                    this.cancelCurrentScan(sendResponse);
                    break;
                default:
                    sendResponse({ success: false, error: 'Unknown action' });
            }
        } catch (error) {
            console.error('Background script error:', error);
            sendResponse({ success: false, error: error.message });
        }
    }
    async scanAndCheckDomain(target, sendResponse, mode = 'broken-links', debug = 'none', maxDepth = 0, scanPagesOnly = true, progressTabId = null) {
        try {
            console.log(`[DEBUG] Starting scanAndCheckDomain: target=${target}, mode=${mode}, debug=${debug}, progressTabId=${progressTabId}`);
            
            // Create abort controller for this scan
            this.currentScanController = new AbortController();
            const abortSignal = this.currentScanController.signal;
            
            const visited = new Set();
            const results = [];
            const origin = (new URL(target)).origin;
            const scanDepth = maxDepth ?? 0; // Use parameter or default to 0
            const self = this; // Store reference to class instance
            
            // Global link cache for this scan session
            const linkCache = new Map();
            
            // Cumulative progress tracking
            let totalPagesToScan = 1; // Start with 1 (the initial page)
            let pagesScanned = 0;
            let totalLinksFound = 0;
            let totalLinksChecked = 0;

            async function scanPage(url, depth) {
                // Check if scan was cancelled
                if (abortSignal.aborted) {
                    console.log(`[DEBUG] Scan cancelled during scanPage for ${url}`);
                    return;
                }
                
                if (debug === 'verbose') console.log(`[DEBUG] scanPage called: url=${url}, depth=${depth}, visited=${visited.size}`);
                
                // First check if we've already visited this URL (before opening tab)
                if (visited.has(url)) {
                    if (debug === 'verbose') console.log(`[DEBUG] Already visited: ${url}`);
                    return;
                }
                
                if (depth > scanDepth) {
                    if (debug === 'verbose') console.log(`[DEBUG] Max depth reached: ${depth} > ${scanDepth}`);
                    return;
                }
                
                if (debug === 'verbose') console.log(`[DEBUG] Visiting: ${url}`);
                
                // Open target in a new tab
                const tab = await new Promise((resolve, reject) => {
                    if (abortSignal.aborted) {
                        reject(new Error('Scan cancelled'));
                        return;
                    }
                    
                    if (debug === 'verbose') console.log(`[DEBUG] Creating tab for: ${url}`);
                    chrome.tabs.create({ url: url, active: false }, tab => {
                        if (tab) {
                            if (debug === 'verbose') console.log(`[DEBUG] Tab created: ${tab.id}`);
                            resolve(tab);
                        } else {
                            console.error(`[DEBUG] Failed to create tab for: ${url}`);
                            reject(new Error('Failed to open tab'));
                        }
                    });
                });
                
                // Wait for tab to load (reduced timeout for performance)
                await new Promise((resolve) => {
                    if (abortSignal.aborted) {
                        chrome.tabs.remove(tab.id);
                        resolve();
                        return;
                    }
                    
                    if (debug === 'verbose') console.log(`[DEBUG] Waiting for tab ${tab.id} to load`);
                    const listener = (tabId, changeInfo) => {
                        if (tabId === tab.id && (changeInfo.status === 'complete' || changeInfo.status === 'interactive')) {
                            chrome.tabs.onUpdated.removeListener(listener);
                            if (debug === 'verbose') console.log(`[DEBUG] Tab ${tab.id} loaded successfully`);
                            resolve();
                        }
                    };
                    chrome.tabs.onUpdated.addListener(listener);
                    // Timeout after 5 seconds to avoid hanging
                    setTimeout(() => {
                        chrome.tabs.onUpdated.removeListener(listener);
                        if (debug === 'verbose') console.log(`[DEBUG] Tab load timeout, proceeding anyway`);
                        resolve();
                    }, 5000);
                });
                
                // Check cancellation again before scanning
                if (abortSignal.aborted) {
                    chrome.tabs.remove(tab.id);
                    console.log(`[DEBUG] Scan cancelled before scanning ${url}`);
                    return;
                }
                
                // Scan links
                if (debug === 'verbose') console.log(`[DEBUG] Scanning links on tab ${tab.id}`);
                
                // Send progress update for current page being scanned
                if (progressTabId) {
                    chrome.tabs.sendMessage(progressTabId, {
                        action: 'scanProgress',
                        type: 'scanningPage',
                        url: url
                    }).catch(err => {
                        if (debug === 'verbose') console.log(`[DEBUG] Failed to send scanningPage message: ${err.message}`);
                    });
                }
                
                const response = await chrome.tabs.sendMessage(tab.id, { action: 'scanPage', scanPagesOnly: scanPagesOnly });
                chrome.tabs.remove(tab.id);
                
                if (!response || !response.success) {
                    console.error(`[DEBUG] Failed to scan page: ${url}`, response);
                    return;
                }
                
                // Use canonical URL for tracking if available, otherwise use the actual URL
                const canonicalUrl = response.canonicalUrl;
                const trackingUrl = canonicalUrl || url;
                
                // Check if we've already processed this canonical URL
                if (visited.has(trackingUrl)) {
                    if (debug === 'verbose') console.log(`[DEBUG] Already processed canonical URL: ${trackingUrl} (from ${url})`);
                    return;
                }
                
                // Mark this canonical URL as visited
                visited.add(trackingUrl);
                
                if (debug === 'verbose') console.log(`[DEBUG] Found ${response.links?.length || 0} links on ${url} (canonical: ${canonicalUrl || 'none'}, tracking as: ${trackingUrl})`);
                
                // Update cumulative link count
                totalLinksFound += response.links?.length || 0;
                
                // Check links
                if (debug === 'verbose') console.log(`[DEBUG] Checking ${response.links?.length || 0} links`);
                const checkedLinks = await self.performLinkChecking(response.links, debug, url, totalLinksChecked, linkCache, abortSignal, progressTabId);
                results.push(...checkedLinks);
                
                // Update checked count
                totalLinksChecked += checkedLinks.length;
                
                // Update checked count
                totalLinksChecked += checkedLinks.length;
                
                if (debug === 'verbose') console.log(`[DEBUG] Checked links, total results now: ${results.length}`);
                
                // Count internal links for progress tracking
                const internalLinks = checkedLinks.filter(link => link.url.startsWith(origin));
                totalPagesToScan += internalLinks.length;
                
                // Send progress update after checking this page
                pagesScanned++;
                if (progressTabId) {
                    chrome.tabs.sendMessage(progressTabId, {
                        action: 'scanProgress',
                        type: 'pageComplete',
                        pagesScanned: pagesScanned,
                        totalPages: totalPagesToScan,
                        linksFound: totalLinksFound,
                        linksChecked: totalLinksChecked
                    }).catch(err => {
                        if (debug === 'verbose') console.log(`[DEBUG] Failed to send pageComplete message: ${err.message}`);
                    });
                }
                
                // Recursively scan internal links
                for (const link of checkedLinks) {
                    if (abortSignal.aborted) {
                        console.log(`[DEBUG] Scan cancelled during recursion`);
                        return;
                    }
                    
                    if (link.url.startsWith(origin) && !visited.has(link.url)) {
                        if (debug === 'verbose') console.log(`[DEBUG] Recursing to internal link: ${link.url}`);
                        await scanPage(link.url, depth + 1);
                    }
                }
            }

            if (debug === 'verbose') console.log(`[DEBUG] Starting scan with target: ${target}`);
            await scanPage(target, 0);
            
            // Clear the controller when done
            this.currentScanController = null;
            
            if (debug === 'verbose') console.log(`[DEBUG] Scan complete, total links found: ${results.length}`);
            sendResponse({ success: true, links: results, pagesScanned: pagesScanned });
        } catch (error) {
            // Clear the controller on error
            this.currentScanController = null;
            
            console.error(`[DEBUG] scanAndCheckDomain error:`, error);
            sendResponse({ success: false, error: error.message });
        }
    }
    
    async scanLinks(tabId, sendResponse) {
        try {
            // Send message to content script to scan the page
            const response = await chrome.tabs.sendMessage(tabId, { action: 'scanPage' });
            
            if (response && response.success) {
                // Store the scanned links
                this.tabData.set(tabId, {
                    links: response.links,
                    lastScanned: Date.now()
                });
                
                sendResponse({
                    success: true,
                    links: response.links
                });
            } else {
                sendResponse({
                    success: false,
                    error: response?.error || 'Failed to scan page'
                });
            }
        } catch (error) {
            sendResponse({
                success: false,
                error: 'Could not communicate with page. Please refresh and try again.'
            });
        }
    }
    
    async checkLinks(tabId, links, sendResponse) {
        try {
            const checkedLinks = await this.performLinkChecking(links);
            
            // Update stored data
            this.tabData.set(tabId, {
                links: checkedLinks,
                lastChecked: Date.now()
            });
            
            sendResponse({
                success: true,
                links: checkedLinks
            });
        } catch (error) {
            sendResponse({
                success: false,
                error: error.message
            });
        }
    }
    
    getTabData(tabId, sendResponse) {
        const data = this.tabData.get(tabId);
        sendResponse(data || { links: [] });
    }
    cancelCurrentScan(sendResponse) {
        if (this.currentScanController) {
            console.log('[DEBUG] Cancelling current scan');
            this.currentScanController.abort();
            this.currentScanController = null;
            sendResponse({ success: true });
        } else {
            console.log('[DEBUG] No active scan to cancel');
            sendResponse({ success: false, error: 'No active scan to cancel' });
        }
    }
    
    async performLinkChecking(links, debug = 'none', pageUrl = '', currentCheckedCount = 0, linkCache = null, abortSignal = null, progressTabId = null) {
        if (debug === 'verbose') console.log(`[DEBUG] performLinkChecking called with ${links?.length || 0} links`);
        
        const batchSize = 10; // Increased from 5 to 10 for better performance
        const results = [...links];
        
        // Add page information to each link
        results.forEach(link => {
            link.foundOnPage = pageUrl;
        });
        
        let checkedCount = currentCheckedCount;
        let newLinksChecked = 0; // Track only newly checked links
        
        // Send initial progress update
        if (progressTabId) {
            chrome.tabs.sendMessage(progressTabId, {
                action: 'scanProgress',
                type: 'progress',
                checked: checkedCount,
                total: results.length
            }).catch(err => {
                if (debug === 'verbose') console.log(`[DEBUG] Failed to send progress message: ${err.message}`);
            });
        }
        
        for (let i = 0; i < results.length; i += batchSize) {
            // Check if scan was cancelled
            if (abortSignal && abortSignal.aborted) {
                console.log(`[DEBUG] Link checking cancelled`);
                break;
            }
            
            const batch = results.slice(i, i + batchSize);
            if (debug === 'verbose') console.log(`[DEBUG] Processing batch ${Math.floor(i/batchSize) + 1}: ${batch.length} links`);
            
            const promises = batch.map(async (link) => {
                // Check if scan was cancelled
                if (abortSignal && abortSignal.aborted) {
                    return link; // Return unchanged link
                }
                
                // Check cache first
                if (linkCache && linkCache.has(link.url)) {
                    if (debug === 'verbose') console.log(`[DEBUG] Using cached result for ${link.url}`);
                    const cachedResult = linkCache.get(link.url);
                    link.status = cachedResult.status;
                    link.statusCode = cachedResult.statusCode;
                    link.error = cachedResult.error;
                    link.checkedAt = cachedResult.checkedAt;
                    link.cached = true; // Mark as cached
                    
                    // Send cached result update
                    if (progressTabId) {
                        chrome.tabs.sendMessage(progressTabId, {
                            action: 'scanProgress',
                            type: 'cached',
                            url: link.url,
                            status: link.status
                        }).catch(err => {
                            if (debug === 'verbose') console.log(`[DEBUG] Failed to send cached message: ${err.message}`);
                        });
                    }
                    
                    return link;
                }
                
                // Send "checking" update for this link
                if (progressTabId) {
                    chrome.tabs.sendMessage(progressTabId, {
                        action: 'scanProgress',
                        type: 'checking',
                        url: link.url
                    }).catch(err => {
                        if (debug === 'verbose') console.log(`[DEBUG] Failed to send checking message: ${err.message}`);
                    });
                }
                
                const result = await this.checkSingleLink(link, debug);
                
                // Cache the result
                if (linkCache) {
                    linkCache.set(link.url, {
                        status: result.status,
                        statusCode: result.statusCode,
                        error: result.error,
                        checkedAt: result.checkedAt
                    });
                }
                
                // Send result update
                if (progressTabId) {
                    chrome.tabs.sendMessage(progressTabId, {
                        action: 'scanProgress',
                        type: 'result',
                        url: link.url,
                        status: result.status,
                        statusCode: result.statusCode,
                        foundOnPage: link.foundOnPage,
                        linkType: link.type
                    }).catch(err => {
                        if (debug === 'verbose') console.log(`[DEBUG] Failed to send result message: ${err.message}`);
                    });
                }
                
                checkedCount++;
                newLinksChecked++;
                
                // Send progress update
                if (progressTabId) {
                    chrome.tabs.sendMessage(progressTabId, {
                        action: 'scanProgress',
                        type: 'progress',
                        checked: checkedCount,
                        total: results.length + currentCheckedCount
                    }).catch(err => {
                        if (debug === 'verbose') console.log(`[DEBUG] Failed to send progress update: ${err.message}`);
                    });
                }
                
                return result;
            });
            
            try {
                await Promise.allSettled(promises);
                if (debug === 'verbose') console.log(`[DEBUG] Batch completed successfully`);
            } catch (error) {
                console.error('[DEBUG] Batch checking error:', error);
            }
            
            // Small delay between batches
            if (i + batchSize < results.length) {
                if (debug === 'verbose') console.log(`[DEBUG] Waiting 200ms before next batch`);
                await this.delay(200); // Reduced from 500ms to 200ms
            }
        }
        
        if (debug === 'verbose') console.log(`[DEBUG] performLinkChecking complete, returning ${results.length} results (${newLinksChecked} newly checked, ${results.length - newLinksChecked} cached)`);
        return results;
    }
    
    async checkSingleLink(link, debug = 'none') {
        if (debug === 'verbose') console.log(`[DEBUG] checkSingleLink: ${link.url}`);
        
        try {
            // Try multiple methods to check the link
            const result = await this.checkLinkWithFallback(link.url, debug);
            
            link.status = result.working ? 'working' : 'broken';
            link.statusCode = result.statusCode;
            link.error = result.error;
            link.checkedAt = Date.now();
            
            if (debug === 'verbose') console.log(`[DEBUG] Link ${link.url} result: ${link.status} (${link.statusCode})`);
            
        } catch (error) {
            if (debug === 'verbose') console.log(`[DEBUG] Link ${link.url} failed: ${error.message}`);
            link.status = 'broken';
            link.error = error.message;
            link.checkedAt = Date.now();
        }
        
        return link;
    }
    
    async checkLinkWithFallback(url, debug = 'none') {
        if (debug === 'verbose') console.log(`[DEBUG] checkLinkWithFallback: ${url}`);
        
        // Method 1: Try HEAD request first (faster)
        try {
            if (debug === 'verbose') console.log(`[DEBUG] Trying HEAD request for ${url}`);
            const headResult = await this.fetchWithTimeout(url, { method: 'HEAD' }, debug);
            
            // If HEAD returns 403, try GET request before marking as broken
            if (headResult.status === 403) {
                if (debug === 'verbose') console.log(`[DEBUG] HEAD returned 403, trying GET for ${url}`);
                try {
                    const getResult = await this.fetchWithTimeout(url, { method: 'GET' }, debug);
                    const result = {
                        working: getResult.ok,
                        statusCode: getResult.status,
                        error: getResult.ok ? null : `HTTP ${getResult.status}`
                    };
                    if (debug === 'verbose') console.log(`[DEBUG] GET result after 403: ${result.working} (${result.statusCode})`);
                    return result;
                } catch (getError) {
                    if (debug === 'verbose') console.log(`[DEBUG] GET failed after 403: ${getError.message}`);
                    // Return the original 403 result
                    return {
                        working: false,
                        statusCode: 403,
                        error: 'HTTP 403'
                    };
                }
            }
            
            const result = {
                working: headResult.ok,
                statusCode: headResult.status,
                error: headResult.ok ? null : `HTTP ${headResult.status}`
            };
            if (debug === 'verbose') console.log(`[DEBUG] HEAD result: ${result.working} (${result.statusCode})`);
            return result;
        } catch (headError) {
            if (debug === 'verbose') console.log(`[DEBUG] HEAD failed: ${headError.message}, trying GET`);
            
            // Method 2: Try GET request if HEAD fails
            try {
                const getResult = await this.fetchWithTimeout(url, { method: 'GET' }, debug);
                const result = {
                    working: getResult.ok,
                    statusCode: getResult.status,
                    error: getResult.ok ? null : `HTTP ${getResult.status}`
                };
                if (debug === 'verbose') console.log(`[DEBUG] GET result: ${result.working} (${result.statusCode})`);
                return result;
            } catch (getError) {
                if (debug === 'verbose') console.log(`[DEBUG] GET failed: ${getError.message}`);
                return {
                    working: false,
                    statusCode: null,
                    error: getError.message || 'Connection failed'
                };
            }
        }
    }
    
    async fetchWithTimeout(url, options = {}, debug = 'none') {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // Reduced to 5 seconds for better performance
        
        if (debug === 'verbose') console.log(`[DEBUG] fetchWithTimeout: ${options.method || 'GET'} ${url}`);
        
        // Try with CORS mode first (can read status)
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
                mode: 'cors' // Try CORS first to read status
            });
            clearTimeout(timeoutId);
            if (debug === 'verbose') console.log(`[DEBUG] fetch response (cors): ${response.status} ${response.statusText}`);
            return response;
        } catch (corsError) {
            if (debug === 'verbose') console.log(`[DEBUG] CORS mode failed: ${corsError.message}, trying no-cors`);
            
            // Fall back to no-cors mode
            try {
                const response = await fetch(url, {
                    ...options,
                    signal: controller.signal,
                    mode: 'no-cors' // Fallback for cross-origin
                });
                clearTimeout(timeoutId);
                if (debug === 'verbose') console.log(`[DEBUG] fetch response (no-cors): opaque response`);
                return response;
            } catch (noCorsError) {
                clearTimeout(timeoutId);
                if (debug === 'verbose') console.log(`[DEBUG] no-cors also failed: ${noCorsError.message}`);
                throw noCorsError;
            }
        }
    }
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize the background service
const linkChecker = new DevKitLinkChecker();

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('DevKit Site Scanner extension installed');
        
        // Optionally open a welcome page
        // chrome.tabs.create({ url: 'https://devkit.free/link-checker-welcome' });
    }
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
    console.log('DevKit Site Scanner extension started');
});