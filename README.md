# DevKit Site Scanner Browser Extension

A powerful browser extension that helps you check for broken links on any website. This extension bypasses CORS restrictions by performing link checks directly from the user's browser.

Broken link feature inspired by https://home.snafu.de/tilman/xenulink.html

## Features

- 🔍 **Smart Link Detection**: Automatically finds all links on any webpage
- ⚡ **Fast Checking**: Efficiently checks multiple links with intelligent batching
- 🌐 **CORS Bypass**: Performs checks from the browser context to avoid cross-origin restrictions
- 📊 **Visual Results**: Clear status indicators for working, broken, and checking states
- 💾 **Session Memory**: Remembers scanned links per tab during your browsing session

## Installation

### Development Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory
5. The DevKit Site Scanner icon should appear in your browser toolbar

### Production Installation

The extension will be available on the Chrome Web Store and Firefox Add-ons store once published.

## Usage

1. **Navigate to any webpage** you want to check for broken links
2. **Click the DevKit Site Scanner icon** in your browser toolbar
3. **Click "Scan for Links"** to find all links on the current page
4. **Click "Check Links"** to test each link and see the results
5. **View the results** with color-coded status indicators:
   - ✅ Green: Working links
   - ❌ Red: Broken links
   - 🔄 Yellow: Currently checking

## Technical Details

### Architecture

The extension consists of three main components:

- **Popup Interface** (`popup.html`, `popup.css`, `popup.js`): User interface for interacting with the extension
- **Content Script** (`content.js`): Runs on web pages to scan and extract links
- **Background Service Worker** (`background.js`): Handles link checking logic and API communication

### Link Checking Methods

The extension uses a multi-tier approach to check links:

1. **HEAD Request**: Fast initial check using HTTP HEAD method
2. **GET Request**: Fallback if HEAD request fails
3. **CORS Fallback**: Attempts CORS mode first, then falls back to no-cors for cross-origin links

### Permissions

The extension requires the following permissions:

- `activeTab`: To access the current webpage for link scanning
- `tabs`: To manage tab-specific data
- `*://*/*`: To perform cross-origin link checks

## Development

### File Structure

```
broken-link-plugin/
├── manifest.json          # Extension configuration
├── popup.html            # Popup interface HTML
├── popup.css             # Popup styling
├── popup.js              # Popup functionality
├── content.js            # Content script for link scanning
├── background.js         # Background service worker
├── icons/                # Extension icons
├── package.json          # Development dependencies
└── README.md            # This file
```

### Building for Production

1. **Test thoroughly** in development mode
2. **Update version** in `manifest.json`
3. **Generate proper icons** (16x16, 48x48, 128x128 PNG files)
4. **Zip the extension** excluding development files
5. **Submit to extension stores**

### Browser Compatibility

- ✅ Chrome/Chromium (Manifest V3)
- ✅ Edge (Chromium-based)
- 🔄 Firefox (with minor modifications for Manifest V2 compatibility)
- ❌ Safari (requires different approach)

## Security Considerations

- The extension only checks links from pages the user actively visits
- No user data is stored permanently
- All link checking happens from the user's browser
- No tracking or analytics are implemented

## Privacy Policy

This extension:
- Does not collect personal information
- Does not track browsing history
- Only processes links from pages you actively choose to scan
- Temporarily stores scan results per browser tab
- Does not communicate with external servers

## Support

For issues, feature requests, or questions:
- Open an issue on the project repository
- Contact support through the DevKit website

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

**Made with ❤️ for the DevKit.free community**