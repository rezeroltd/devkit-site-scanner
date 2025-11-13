// Content script - runs in the context of web pages to extract links
class LinkScanner {
    constructor() {
        this.setupMessageListener();
    }
    
    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'scanPage') {
                const scanPagesOnly = message.scanPagesOnly !== false; // Default to true
                this.scanPage(scanPagesOnly)
                    .then(result => sendResponse({ success: true, links: result.links, canonicalUrl: result.canonicalUrl }))
                    .catch(error => sendResponse({ success: false, error: error.message }));
                return true; // Keeps the message channel open for async response
            }
        });
    }
    
    async scanPage() {
        const links = [];
        const processedUrls = new Set();
        
        // Extract canonical URL
        const canonicalUrl = this.getCanonicalUrl();
        
        // Find all anchor tags with href attributes
        const anchors = document.querySelectorAll('a[href]');
        
        anchors.forEach(anchor => {
            const href = anchor.href;
            const text = anchor.textContent.trim();
            
            // Skip if we've already processed this URL
            if (processedUrls.has(href)) return;
            processedUrls.add(href);
            
            // Skip anchor links, javascript links, and mailto links
            if (this.shouldSkipLink(href)) return;
            
            // Extract additional metadata
            const linkData = {
                url: href,
                text: text || anchor.getAttribute('title') || href,
                type: 'page',
                element: {
                    tagName: anchor.tagName,
                    className: anchor.className,
                    id: anchor.id
                },
                status: 'unchecked',
                position: this.getElementPosition(anchor)
            };
            
            links.push(linkData);
        });
        
        // Also scan for links in other elements (like area tags in image maps)
        const areas = document.querySelectorAll('area[href]');
        areas.forEach(area => {
            const href = area.href;
            if (!processedUrls.has(href) && !this.shouldSkipLink(href)) {
                processedUrls.add(href);
                links.push({
                    url: href,
                    text: area.alt || area.title || href,
                    type: 'page',
                    element: {
                        tagName: area.tagName,
                        className: area.className,
                        id: area.id
                    },
                    status: 'unchecked',
                    position: null
                });
            }
        });
        
        // Sort links by position (top to bottom, left to right)
        links.sort((a, b) => {
            if (!a.position || !b.position) return 0;
            if (a.position.top !== b.position.top) {
                return a.position.top - b.position.top;
            }
            return a.position.left - b.position.left;
        });
        
        return { links, canonicalUrl };
    }
    
    async scanPage(scanPagesOnly = true) {
        const links = [];
        const processedUrls = new Set();
        
        // Extract canonical URL
        const canonicalUrl = this.getCanonicalUrl();
        
        // Scan page links (always)
        const anchors = document.querySelectorAll('a[href]');
        anchors.forEach(anchor => {
            const href = anchor.href;
            const text = anchor.textContent.trim();
            
            if (!processedUrls.has(href) && !this.shouldSkipLink(href)) {
                processedUrls.add(href);
                links.push({
                    url: href,
                    text: text || anchor.getAttribute('title') || href,
                    type: 'page',
                    element: { tagName: anchor.tagName, className: anchor.className, id: anchor.id },
                    status: 'unchecked',
                    position: this.getElementPosition(anchor)
                });
            }
        });
        
        // Scan area tags for image maps
        const areas = document.querySelectorAll('area[href]');
        areas.forEach(area => {
            const href = area.href;
            if (!processedUrls.has(href) && !this.shouldSkipLink(href)) {
                processedUrls.add(href);
                links.push({
                    url: href,
                    text: area.alt || area.title || href,
                    type: 'page',
                    element: { tagName: area.tagName, className: area.className, id: area.id },
                    status: 'unchecked',
                    position: null
                });
            }
        });
        
        // If not pages-only, also scan images, CSS, and JS
        if (!scanPagesOnly) {
            // Scan images
            const images = document.querySelectorAll('img[src]');
            images.forEach(img => {
                const href = img.src;
                if (!processedUrls.has(href)) {
                    processedUrls.add(href);
                    links.push({
                        url: href,
                        text: img.alt || img.title || 'Image',
                        type: 'image',
                        element: { tagName: img.tagName, className: img.className, id: img.id },
                        status: 'unchecked',
                        position: this.getElementPosition(img)
                    });
                }
            });
            
            // Scan CSS links
            const links_css = document.querySelectorAll('link[href][rel="stylesheet"]');
            links_css.forEach(link => {
                const href = link.href;
                if (!processedUrls.has(href)) {
                    processedUrls.add(href);
                    links.push({
                        url: href,
                        text: href.split('/').pop() || 'CSS file',
                        type: 'css',
                        element: { tagName: link.tagName, className: link.className, id: link.id },
                        status: 'unchecked',
                        position: null
                    });
                }
            });
            
            // Scan JS files
            const scripts = document.querySelectorAll('script[src]');
            scripts.forEach(script => {
                const href = script.src;
                if (!processedUrls.has(href)) {
                    processedUrls.add(href);
                    links.push({
                        url: href,
                        text: href.split('/').pop() || 'JavaScript file',
                        type: 'js',
                        element: { tagName: script.tagName, className: script.className, id: script.id },
                        status: 'unchecked',
                        position: null
                    });
                }
            });
        }
        
        // Sort links by position (top to bottom, left to right)
        links.sort((a, b) => {
            if (!a.position || !b.position) return 0;
            if (a.position.top !== b.position.top) {
                return a.position.top - b.position.top;
            }
            return a.position.left - b.position.left;
        });
        
        return { links, canonicalUrl };
    }
    
    shouldSkipLink(href) {
        // Skip anchor links (same page)
        if (href.startsWith('#')) return true;
        
        // Skip javascript links
        if (href.startsWith('javascript:')) return true;
        
        // Skip mailto links
        if (href.startsWith('mailto:')) return true;
        
        // Skip tel links
        if (href.startsWith('tel:')) return true;
        
        // Skip sms links
        if (href.startsWith('sms:')) return true;
        
        // Skip file download links that are unlikely to be "broken"
        const fileExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.zip', '.rar'];
        const lowerHref = href.toLowerCase();
        if (fileExtensions.some(ext => lowerHref.includes(ext))) return true;
        
        return false;
    }
    
    getElementPosition(element) {
        try {
            const rect = element.getBoundingClientRect();
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
            
            return {
                top: rect.top + scrollTop,
                left: rect.left + scrollLeft,
                width: rect.width,
                height: rect.height
            };
        } catch (error) {
            return null;
        }
    }
    
    getCanonicalUrl() {
        // Look for canonical link tag
        const canonicalLink = document.querySelector('link[rel="canonical"]');
        if (canonicalLink && canonicalLink.href) {
            return canonicalLink.href;
        }
        return null; // No canonical URL found
    }
    
    // Method to remove highlights
    removeHighlights() {
        const anchors = document.querySelectorAll('a[href]');
        anchors.forEach(anchor => {
            anchor.style.outline = '';
            anchor.style.outlineOffset = '';
        });
    }
}

// Initialize the link scanner
const linkScanner = new LinkScanner();

// Expose some methods for potential use by other scripts
window.devkitLinkChecker = {
    scan: () => linkScanner.scanPage(),
    highlight: (url, status) => linkScanner.highlightLink(url, status),
    removeHighlights: () => linkScanner.removeHighlights()
};