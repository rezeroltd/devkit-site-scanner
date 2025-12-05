// Popup JavaScript - handles user interactions
class LinkCheckerPopup {
    constructor() {
        this.currentTab = null;
        this.isScanning = false;
        
        this.init();
    }
    
    async init() {
        await this.getCurrentTab();
        this.setupEventListeners();
        this.updateCurrentUrl();
        this.updateCheckButtonState();
    }
    
    async getCurrentTab() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        this.currentTab = tab;
    }
    
    setupEventListeners() {
        document.getElementById('check-btn').addEventListener('click', () => this.checkLinks());
    }
    
    updateCurrentUrl() {
        const urlElement = document.getElementById('current-url');
        if (this.currentTab && this.currentTab.url) {
            // Check if we're on a plugin-scan page
            if (this.currentTab.url.includes('devkit.free/plugin-scan')) {
                // Parse target from query parameter
                try {
                    const url = new URL(this.currentTab.url);
                    const target = url.searchParams.get('target');
                    if (target) {
                        const targetUrl = new URL(target);
                        urlElement.textContent = `Target: ${targetUrl.hostname}${targetUrl.pathname}`;
                        urlElement.title = target;
                        return;
                    }
                } catch (e) {
                    // Fall back to showing the plugin-scan page
                }
            }
            
            // Default behavior for regular pages
            const url = new URL(this.currentTab.url);
            urlElement.textContent = url.hostname + url.pathname;
            urlElement.title = this.currentTab.url;
        }
    }
    
    updateCheckButtonState() {
        const checkBtn = document.getElementById('check-btn');
        
        // Special handling for plugin-scan pages
        if (this.currentTab.url.includes('devkit.free/plugin-scan')) {
            try {
                const url = new URL(this.currentTab.url);
                const target = url.searchParams.get('target');
                // Enable if we have a valid target parameter
                checkBtn.disabled = !target;
            } catch (e) {
                checkBtn.disabled = true;
            }
            return;
        }
        
        // Default behavior for regular pages
        checkBtn.disabled = !this.currentTab || !this.currentTab.url || 
                           this.currentTab.url.startsWith('chrome://') || 
                           this.currentTab.url.startsWith('chrome-extension://');
    }
    
    cancelScan() {
        if (this.isScanning) {
            // Send cancel message to background script
            chrome.runtime.sendMessage({
                action: 'cancelScan'
            });
            this.showMessage('Cancelling scan...');
        }
    }
    
    showCancelButton(show) {
        const cancelBtn = document.getElementById('cancel-btn');
        const checkBtn = document.getElementById('check-btn');
        
        if (show) {
            cancelBtn.style.display = 'block';
            checkBtn.style.display = 'none';
        } else {
            cancelBtn.style.display = 'none';
            checkBtn.style.display = 'block';
        }
    }
    
    setLoadingState(buttonId, loading) {
        const button = document.getElementById(buttonId);
        if (loading) {
            button.classList.add('loading');
            button.disabled = true;
        } else {
            button.classList.remove('loading');
            button.disabled = false;
        }
    }
    
    showMessage(message) {
        // Simple message display - could be enhanced with a proper notification system
        console.log(message);
        // For now, we'll just log to console. In a real implementation,
        // you might want to show a toast notification or update the UI
    }
    
    updateCheckButtonState() {
        const checkBtn = document.getElementById('check-btn');
        
        // Special handling for plugin-scan pages
        if (this.currentTab.url.includes('devkit.free/plugin-scan')) {
            try {
                const url = new URL(this.currentTab.url);
                const target = url.searchParams.get('target');
                // Enable if we have a valid target parameter
                checkBtn.disabled = !target;
            } catch (e) {
                checkBtn.disabled = true;
            }
            return;
        }
        
        // Default behavior for regular pages
        checkBtn.disabled = !this.currentTab || !this.currentTab.url || 
                           this.currentTab.url.startsWith('chrome://') || 
                           this.currentTab.url.startsWith('chrome-extension://');
    }
    
    async checkLinks() {
        if (this.isScanning) return;
        
        this.isScanning = true;
        this.setLoadingState('check-btn', true);
        
        try {
            // Get configuration from form inputs
            const maxDepthInput = document.getElementById('max-depth-input');
            const scanPagesOnlyCheckbox = document.getElementById('scan-pages-only');
            
            const maxDepth = parseInt(maxDepthInput.value);
            const scanPagesOnly = scanPagesOnlyCheckbox.checked;
            
            // Validate max depth (allow 0 or greater)
            if (isNaN(maxDepth) || maxDepth < 0) {
                this.showMessage('Maximum depth must be a number 0 or greater');
                this.isScanning = false;
                this.setLoadingState('check-btn', false);
                return;
            }
            
            // Determine the target URL to scan
            let targetUrl = this.currentTab.url;
            
            // If we're on a plugin-scan page, extract the target from query parameters
            if (this.currentTab.url.includes('devkit.free/plugin-scan')) {
                try {
                    const url = new URL(this.currentTab.url);
                    const target = url.searchParams.get('target');
                    if (target) {
                        targetUrl = target;
                    }
                } catch (e) {
                    // Fall back to current tab URL
                }
            }
            
            // Open plugin-scan page in a new tab with the target URL and configuration
            const scanUrl = `https://devkit.free/plugin-scan/?target=${encodeURIComponent(targetUrl)}&maxdepth=${maxDepth}&pagesonly=${scanPagesOnly}`;
            await chrome.tabs.create({ url: scanUrl });
            
            // Close the popup
            window.close();
            
        } catch (error) {
            this.showMessage('Error opening scan page: ' + error.message);
            this.isScanning = false;
            this.setLoadingState('check-btn', false);
        }
    }
    
    cancelScan() {
        if (this.isScanning) {
            // Send cancel message to background script
            chrome.runtime.sendMessage({
                action: 'cancelScan'
            });
            this.showMessage('Cancelling scan...');
        }
    }
    
    showCancelButton(show) {
        const cancelBtn = document.getElementById('cancel-btn');
        const checkBtn = document.getElementById('check-btn');
        
        if (show) {
            cancelBtn.style.display = 'block';
            checkBtn.style.display = 'none';
        } else {
            cancelBtn.style.display = 'none';
            checkBtn.style.display = 'block';
        }
    }
    
    updateUI() {
        this.updateStats();
        this.updateLinkList();
    }
    
    updateStats() {
        const statsEl = document.getElementById('stats');
        const totalEl = document.getElementById('total-links');
        const brokenEl = document.getElementById('broken-links');
        const workingEl = document.getElementById('working-links');
        
        const total = this.links.length;
        const broken = this.links.filter(link => link.status === 'broken').length;
        const working = this.links.filter(link => link.status === 'working').length;
        
        totalEl.textContent = total;
        brokenEl.textContent = broken;
        workingEl.textContent = working;
        
        if (total > 0) {
            statsEl.style.display = 'flex';
        }
    }
    
    updateLinkList() {
        const listEl = document.getElementById('link-list');
        listEl.innerHTML = '';
        
        // Sort links: broken first, then by URL
        const sortedLinks = [...this.links].sort((a, b) => {
            if (a.status === 'broken' && b.status !== 'broken') return -1;
            if (a.status !== 'broken' && b.status === 'broken') return 1;
            return a.url.localeCompare(b.url);
        });
        
        sortedLinks.forEach(link => {
            const linkEl = this.createLinkElement(link);
            listEl.appendChild(linkEl);
        });
    }
    
    createLinkElement(link) {
        const div = document.createElement('div');
        div.className = 'link-item';
        
        const statusIcon = this.getStatusIcon(link.status);
        const statusClass = `status-${link.status}`;
        
        div.innerHTML = `
            <div class="link-status ${statusClass}">${statusIcon}</div>
            <div class="link-details">
                <div class="link-url">${this.truncateUrl(link.url)}</div>
                <div class="link-text">${this.escapeHtml(link.text || 'No text')}</div>
            </div>
        `;
        
        return div;
    }
    
    getStatusIcon(status) {
        switch (status) {
            case 'working': return '✅';
            case 'broken': return '❌';
            case 'checking': return '🔄';
            default: return '⭕';
        }
    }
    
    truncateUrl(url) {
        if (url.length <= 50) return url;
        return url.substring(0, 47) + '...';
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    setLoadingState(buttonId, loading) {
        const button = document.getElementById(buttonId);
        if (loading) {
            button.classList.add('loading');
            button.disabled = true;
        } else {
            button.classList.remove('loading');
            button.disabled = false;
        }
    }
    
    showMessage(message) {
        // Simple message display - could be enhanced with a proper notification system
        console.log(message);
        // For now, we'll just log to console. In a real implementation,
        // you might want to show a toast notification or update the UI
    }
}

// Initialize the popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new LinkCheckerPopup();
});