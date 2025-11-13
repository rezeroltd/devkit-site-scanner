// plugin-scan.js - Content script for plugin-scan page
(async function() {
    // Only run on plugin-scan page
    if (!location.pathname.startsWith('/plugin-scan/')) return;

    // Parse target domain from query string
    const params = new URLSearchParams(location.search);
    const target = params.get('target');
    const mode = params.get('mode') || 'broken-links';
    const debug = params.get('debug') || 'none';
    const maxDepth = parseInt(params.get('maxdepth')) || 2;
    const scanPagesOnly = params.get('pagesonly') !== 'false'; // Default to true

    if (!target) {
        document.body.innerHTML = '<h2>No target specified for scan.</h2>';
        return;
    }

    // Show loading UI with progress indicators
    document.body.innerHTML = `<div style='text-align:center; margin:20px 0;'><a href='https://devkit.free' target='_blank' style='text-decoration:none;'><img src='${chrome.runtime.getURL('devkit-logo.svg')}' alt='DevKit' style='max-width:200px; height:auto;'></a></div><div style='text-align:center; margin:10px 0; font-size:14px; color:#666;'>No data is sent back to our servers using this tool</div><h2>Scanning links on <span style='color:#667eea'>${target}</span>...</h2><div id='current-page' style='margin:10px 0; padding:8px; background:#fff3cd; border-left:4px solid #ffc107; display:none;'></div><div id='scan-status'>Initializing scan...</div><div id='current-link' style='margin:10px 0; padding:8px; background:#e8f4fd; border-left:4px solid #667eea; display:none;'></div><div id='progress' style='margin:10px 0;'><div id='progress-bar' style='width:0%; height:20px; background:linear-gradient(90deg, #667eea, #764ba2); transition:width 0.3s ease;'></div></div><div id='stats' style='margin:10px 0; font-size:14px; color:#666;'>Links found: 0 | Checked: 0 | Cached: 0 | Working: 0 | Broken: 0</div><div id='cancel-section' style='text-align:center; margin:15px 0;'><button id='cancel-scan-btn' style='background:#dc3545; color:white; border:none; padding:8px 16px; border-radius:4px; cursor:pointer; font-weight:bold; display:none;'>🛑 Cancel Scan</button></div><div id='debug-output' style='margin-top:20px; padding:10px; background:#f5f5f5; font-family:monospace; font-size:12px; white-space:pre-wrap; max-height:200px; overflow-y:auto; display:none;'></div><div id='results-area' style='margin-top:20px; display:none;'><div id='results-summary' style='margin:10px 0; padding:10px; background:#f0f8ff; border-radius:5px;'></div><div id='results-list' style='max-height:400px; overflow-y:auto; border:1px solid #ddd; border-radius:5px;'></div><div id='export-section' style='text-align:center; margin-top:20px; padding-top:20px; border-top:1px solid #ddd; display:none;'><button id='export-csv-btn' style='background:#667eea; color:white; border:none; padding:10px 20px; border-radius:5px; cursor:pointer; font-weight:bold;'>📊 Export Results as CSV</button></div><div id='back-link' style='text-align:center; margin-top:20px; padding-top:20px; border-top:1px solid #ddd; display:none;'><a href='https://devkit.free/tools/broken-link-checker/' target='_blank' style='color:#667eea; text-decoration:none; font-weight:bold;'>← Back to DevKit Broken Site Scanner</a></div></div>`;

    const debugOutput = document.getElementById('debug-output');
    const scanStatus = document.getElementById('scan-status');
    const currentPage = document.getElementById('current-page');
    const currentLink = document.getElementById('current-link');
    const progressBar = document.getElementById('progress-bar');
    const statsDiv = document.getElementById('stats');
    const cancelSection = document.getElementById('cancel-section');
    const cancelScanBtn = document.getElementById('cancel-scan-btn');
    const resultsArea = document.getElementById('results-area');
    const resultsSummary = document.getElementById('results-summary');
    const resultsList = document.getElementById('results-list');
    const exportSection = document.getElementById('export-section');
    const exportCsvBtn = document.getElementById('export-csv-btn');

    let isScanning = false; // Track if scan is in progress
    let scanComplete = false; // Track if scan has completed
    let totalLinks = 0;
    let checkedLinks = 0;
    let workingLinks = 0;
    let brokenLinks = 0;
    let cachedLinks = 0;
    let uniqueUrls = new Set(); // Track unique URLs discovered
    let allResults = []; // Store all link results for final display

    function logDebug(message, level = 'info') {
        if (debug === 'verbose') {
            const timestamp = new Date().toLocaleTimeString();
            debugOutput.textContent += `[${timestamp}] ${level.toUpperCase()}: ${message}\n`;
            debugOutput.style.display = 'block';
            debugOutput.scrollTop = debugOutput.scrollHeight;
        }
    }

    function updateStatus(message) {
        scanStatus.innerHTML = message;
        logDebug(`Status: ${message}`);
    }

    function updateCurrentLink(url) {
        currentLink.textContent = `Checking: ${url}`;
        currentLink.style.display = 'block';
        logDebug(`Checking link: ${url}`);
    }

    function updateCurrentPage(url) {
        currentPage.innerHTML = `<strong>📄 Scanning page:</strong> <a href='${url}' target='_blank' style='color:#856404; text-decoration:none;'>${url}</a>`;
        currentPage.style.display = 'block';
        logDebug(`Scanning page: ${url}`);
    }

    function updateProgress(checked, total) {
        const percentage = total > 0 ? Math.round((checked / total) * 100) : 0;
        progressBar.style.width = `${percentage}%`;
        // Don't override checkedLinks - we track it separately
        totalLinks = uniqueUrls.size; // Use actual unique count
        updateStats();
    }

    function updateStats() {
        statsDiv.textContent = `Unique links found: ${totalLinks} | Checked: ${checkedLinks} | Working: ${workingLinks} | Broken: ${brokenLinks}`;
    }

    function updateLinkResult(url, status, isCached = false) {
        if (isCached) {
            cachedLinks++;
        } else {
            checkedLinks++; // Only increment for actually checked links
            if (status === 'working') {
                workingLinks++;
            } else if (status === 'broken') {
                brokenLinks++;
            }
        }
        updateStats();
        logDebug(`Link result: ${url} -> ${status}${isCached ? ' (cached)' : ''}`);
    }

    function displayFinalResults(links, pagesScanned = 0) {
        // Store all results
        allResults = links;
        
        // Show results area
        resultsArea.style.display = 'block';
        
        // Show export section and back link
        if (exportSection) {
            exportSection.style.display = 'block';
        }
        const backLink = document.getElementById('back-link');
        if (backLink) {
            backLink.style.display = 'block';
        }
        
        // Create summary
        const uniqueLinks = new Set(links.map(link => link.url)).size;
        const cachedCount = links.filter(link => link.cached).length;
        const checkedCount = links.length - cachedCount;
        const workingCount = links.filter(link => link.status === 'working' && !link.cached).length;
        const brokenCount = links.filter(link => link.status === 'broken' && !link.cached).length;
        
        resultsSummary.innerHTML = `
            <strong>Scan Summary:</strong><br>
            Pages scanned: ${pagesScanned}<br>
            Total unique links found: ${uniqueLinks}<br>
            Links checked: ${checkedCount}<br>
            Working links: ${workingCount}<br>
            Broken links: ${brokenCount}
        `;
        
        // Create results table
        let html = `
            <table style='width:100%; border-collapse:collapse; font-size:12px;'>
                <thead>
                    <tr style='background:#f0f0f0;'>
                        <th style='border:1px solid #ddd; padding:8px; text-align:left; width:80px;'>Status</th>
                        <th style='border:1px solid #ddd; padding:8px; text-align:left; width:50px;'>Type</th>
                        <th style='border:1px solid #ddd; padding:8px; text-align:left;'>On Page</th>
                        <th style='border:1px solid #ddd; padding:8px; text-align:left;'>URL</th>
                        <th style='border:1px solid #ddd; padding:8px; text-align:left;'>Code</th>
                        <th style='border:1px solid #ddd; padding:8px; text-align:left;'>Source</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        // Group by status and source for better organization, then sort within groups
        const broken = links.filter(link => link.status === 'broken').sort((a, b) => {
            if (a.foundOnPage < b.foundOnPage) return -1;
            if (a.foundOnPage > b.foundOnPage) return 1;
            return a.url < b.url ? -1 : a.url > b.url ? 1 : 0;
        });
        const workingChecked = links.filter(link => link.status === 'working' && !link.cached).sort((a, b) => {
            if (a.foundOnPage < b.foundOnPage) return -1;
            if (a.foundOnPage > b.foundOnPage) return 1;
            return a.url < b.url ? -1 : a.url > b.url ? 1 : 0;
        });
        const workingCached = links.filter(link => link.status === 'working' && link.cached).sort((a, b) => {
            if (a.foundOnPage < b.foundOnPage) return -1;
            if (a.foundOnPage > b.foundOnPage) return 1;
            return a.url < b.url ? -1 : a.url > b.url ? 1 : 0;
        });
        
        // Create sorted results array for export
        const sortedLinks = [...broken, ...workingChecked, ...workingCached];
        allResults = sortedLinks;
        
        // Add broken links first
        broken.forEach(link => {
            html += `
                <tr>
                    <td style='border:1px solid #ddd; padding:8px; color:#dc3545; font-weight:bold;'>✗ Broken</td>
                    <td style='border:1px solid #ddd; padding:8px;'>${link.type || 'page'}</td>
                    <td style='border:1px solid #ddd; padding:8px;'><a href='${link.foundOnPage}' target='_blank' style='color:#007bff; text-decoration:none;'>${link.foundOnPage}</a></td>
                    <td style='border:1px solid #ddd; padding:8px;'><a href='${link.url}' target='_blank' style='color:#007bff; text-decoration:none;'>${link.url}</a></td>
                    <td style='border:1px solid #ddd; padding:8px;'>${link.statusCode || 'N/A'}</td>
                    <td style='border:1px solid #ddd; padding:8px;'>${link.cached ? 'Cache' : 'Checked'}</td>
                </tr>
            `;
        });
        
        // Add working links checked first
        workingChecked.forEach(link => {
            html += `
                <tr>
                    <td style='border:1px solid #ddd; padding:8px; color:#28a745; font-weight:bold;'>✓ Working</td>
                    <td style='border:1px solid #ddd; padding:8px;'>${link.type || 'page'}</td>
                    <td style='border:1px solid #ddd; padding:8px;'><a href='${link.foundOnPage}' target='_blank' style='color:#007bff; text-decoration:none;'>${link.foundOnPage}</a></td>
                    <td style='border:1px solid #ddd; padding:8px;'><a href='${link.url}' target='_blank' style='color:#007bff; text-decoration:none;'>${link.url}</a></td>
                    <td style='border:1px solid #ddd; padding:8px;'>${link.statusCode || 'N/A'}</td>
                    <td style='border:1px solid #ddd; padding:8px;'>${link.cached ? 'Cache' : 'Checked'}</td>
                </tr>
            `;
        });
        
        // Add working links from cache last
        workingCached.forEach(link => {
            html += `
                <tr>
                    <td style='border:1px solid #ddd; padding:8px; color:#28a745; font-weight:bold;'>✓ Working</td>
                    <td style='border:1px solid #ddd; padding:8px;'>${link.type || 'page'}</td>
                    <td style='border:1px solid #ddd; padding:8px;'><a href='${link.foundOnPage}' target='_blank' style='color:#007bff; text-decoration:none;'>${link.foundOnPage}</a></td>
                    <td style='border:1px solid #ddd; padding:8px;'><a href='${link.url}' target='_blank' style='color:#007bff; text-decoration:none;'>${link.url}</a></td>
                    <td style='border:1px solid #ddd; padding:8px;'>${link.statusCode || 'N/A'}</td>
                    <td style='border:1px solid #ddd; padding:8px;'>${link.cached ? 'Cache' : 'Checked'}</td>
                </tr>
            `;
        });
        
        html += `
                </tbody>
            </table>
        `;
        
        resultsList.innerHTML = html;
    }

    function exportResultsToCSV(links, target) {
        if (!links || links.length === 0) {
            alert('No results to export');
            return;
        }

        // Create CSV header in same order as table: Status, Type, On Page, URL, Code, Source
        const headers = ['Status', 'Type', 'On Page', 'URL', 'Code', 'Source'];
        
        // Create CSV rows in same order
        const rows = links.map(link => [
            link.status === 'working' ? 'Working' : 'Broken',
            link.type || 'page',
            link.foundOnPage,
            link.url,
            link.statusCode || 'N/A',
            link.cached ? 'Cache' : 'Checked'
        ]);

        // Combine headers and rows
        const csvContent = [headers, ...rows]
            .map(row => row.map(field => `"${field}"`).join(','))
            .join('\n');

        // Create and download the file
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `link-scan-results-${target.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    // Add export button event listener
    if (exportCsvBtn) {
        exportCsvBtn.addEventListener('click', () => {
            exportResultsToCSV(allResults, target);
        });
    }

    // Add cancel button event listener
    if (cancelScanBtn) {
        cancelScanBtn.addEventListener('click', () => {
            cancelCurrentScan();
        });
    }

    function showCancelButton(show) {
        if (cancelSection && cancelScanBtn) {
            cancelSection.style.display = show ? 'block' : 'none';
            cancelScanBtn.style.display = show ? 'inline-block' : 'none';
        }
    }

    function cancelCurrentScan() {
        if (isScanning) {
            updateStatus('Cancelling scan...');
            cancelScanBtn.disabled = true;
            cancelScanBtn.textContent = 'Cancelling...';
            scanComplete = true; // Prevent further progress updates
            
            // Send cancel message to background script
            chrome.runtime.sendMessage({
                action: 'cancelScan'
            }, function(response) {
                logDebug('Cancel scan response: ' + JSON.stringify(response));
                if (response && response.success) {
                    updateStatus('Scan cancelled by user.');
                    showCancelButton(false);
                    isScanning = false;
                } else {
                    updateStatus('Failed to cancel scan.');
                    cancelScanBtn.disabled = false;
                    cancelScanBtn.textContent = '🛑 Cancel Scan';
                    scanComplete = false; // Allow updates again if cancel failed
                }
            });
        }
    }

    logDebug(`Starting scan for target: ${target}, mode: ${mode}, debug: ${debug}`);

    // Mark scan as in progress and show cancel button
    isScanning = true;
    showCancelButton(true);

    // Listen for progress updates from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'scanProgress') {
            if (message.type === 'scanningPage' && !scanComplete) {
                updateCurrentPage(message.url);
            } else if (message.type === 'checking' && !scanComplete) {
                uniqueUrls.add(message.url); // Track unique URL
                updateCurrentLink(message.url);
            } else if (message.type === 'result') {
                updateLinkResult(message.url, message.status, false);
            } else if (message.type === 'cached') {
                uniqueUrls.add(message.url); // Track unique URL
                updateLinkResult(message.url, message.status, true);
            } else if (message.type === 'progress') {
                updateProgress(message.checked, message.total);
            } else if (message.type === 'pageComplete') {
                // Update overall progress with cumulative stats
                // Don't override checkedLinks - we track it separately
                totalLinks = uniqueUrls.size; // Use actual unique count
                updateProgress(message.linksChecked, message.linksFound);
                updateStatus(`Scanned ${message.pagesScanned} pages, found ${uniqueUrls.size} unique links...`);
            } else if (message.type === 'status') {
                updateStatus(message.message);
            }
        }
    });

    // Open target domain in a new tab and scan links
    chrome.runtime.sendMessage({
        action: 'scanAndCheckDomain',
        target: target,
        mode: mode,
        debug: debug,
        maxDepth: maxDepth,
        scanPagesOnly: scanPagesOnly
    }, function(response) {
        logDebug(`Received final response: ${JSON.stringify(response, null, 2)}`);

        // Mark scan as complete and hide cancel button
        isScanning = false;
        scanComplete = true;
        showCancelButton(false);

        if (response && response.success) {
            // Change the main heading to show scan results
            const mainHeading = document.querySelector('h2');
            if (mainHeading) {
                mainHeading.innerHTML = `Scan Results for <span style='color:#667eea'>${target}</span>`;
            }
            
            // Hide all progress elements
            currentPage.style.display = 'none';
            scanStatus.style.display = 'none';
            currentLink.style.display = 'none';
            progressBar.parentElement.style.display = 'none';
            statsDiv.style.display = 'none';
            debugOutput.style.display = 'none';
            
            // Display final results
            displayFinalResults(response.links, response.pagesScanned || 0);
        } else {
            const errorMsg = response?.error || 'Unknown error';
            updateStatus('Scan failed: ' + errorMsg);
            logDebug(`Scan failed: ${errorMsg}`);
        }
    });
})();
