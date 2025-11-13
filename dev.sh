#!/bin/bash

# DevKit Site Scanner Extension Development Helper
# This script helps with common development tasks

set -e

echo "🔗 DevKit Site Scanner Extension Helper"
echo "======================================"

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to create placeholder icons
create_placeholder_icons() {
    echo "📱 Checking for placeholder icons..."
    
    # Check if icons already exist
    if [[ -f "icons/icon-16.png" && -f "icons/icon-48.png" && -f "icons/icon-128.png" ]]; then
        echo "✅ All required icons already exist"
        return 0
    fi
    
    echo "📱 Creating missing placeholder icons..."
    
    if command_exists convert; then
        # Use ImageMagick if available
        [[ ! -f "icons/icon-16.png" ]] && convert -size 16x16 xc:"#667eea" icons/icon-16.png
        [[ ! -f "icons/icon-48.png" ]] && convert -size 48x48 xc:"#667eea" icons/icon-48.png
        [[ ! -f "icons/icon-128.png" ]] && convert -size 128x128 xc:"#667eea" icons/icon-128.png
        echo "✅ Placeholder icons created using ImageMagick"
    else
        echo "⚠️  ImageMagick not found. Please create icons manually:"
        echo "   - icons/icon-16.png (16x16)"
        echo "   - icons/icon-48.png (48x48)"
        echo "   - icons/icon-128.png (128x128)"
        return 1
    fi
}

# Function to validate extension files
validate_extension() {
    echo "🔍 Validating extension files..."
    
    required_files=(
        "manifest.json"
        "popup.html"
        "popup.css"
        "popup.js"
        "content.js"
        "background.js"
    )
    
    for file in "${required_files[@]}"; do
        if [[ -f "$file" ]]; then
            echo "✅ $file"
        else
            echo "❌ $file (missing)"
            exit 1
        fi
    done
    
    echo "✅ All required files present"
}

# Function to package extension
package_extension() {
    echo "📦 Packaging extension..."
    
    # Clean previous build
    rm -rf dist devkit-site-scanner.zip
    
    # Create dist directory
    mkdir -p dist
    
    # Copy files
    cp -r *.js *.html *.css *.json *.svg icons dist/ 2>/dev/null || true
    cp README.md LICENSE dist/ 2>/dev/null || true
    
    # Create zip
    cd dist
    zip -r ../devkit-site-scanner.zip . -x "*.DS_Store" "*/.*"
    cd ..
    
    echo "✅ Extension packaged as devkit-site-scanner.zip"
}

# Function to package extension for Firefox
package_firefox_extension() {
    echo "🦊 Packaging extension for Firefox..."
    
    # Clean previous build
    rm -rf dist firefox-devkit-site-scanner.zip
    
    # Create dist directory
    mkdir -p dist
    
    # Copy files
    cp -r *.js *.html *.css *.svg icons dist/ 2>/dev/null || true
    cp README.md LICENSE dist/ 2>/dev/null || true
    
    # Copy Firefox-specific manifest
    cp manifest.firefox.json dist/manifest.json
    
    # Create zip
    cd dist
    zip -r ../firefox-devkit-site-scanner.zip . -x "*.DS_Store" "*/.*"
    cd ..
    
    echo "✅ Firefox extension packaged as firefox-devkit-site-scanner.zip"
}

# Function to show reload instructions
show_reload_instructions() {
    echo ""
    echo "� Reload Extension Instructions:"
    echo "=================================="
    echo "After updating code, reload the extension to see changes:"
    echo ""
    echo "📱 Chrome/Edge:"
    echo "1. Go to chrome://extensions/ (or edge://extensions/)"
    echo "2. Find 'DevKit Site Scanner'"
    echo "3. Click the refresh/reload button (🔄)"
    echo "4. Or click 'Update' if available"
    echo ""
    echo "🦊 Firefox:"
    echo "1. Go to about:debugging"
    echo "2. Click 'This Firefox'"
    echo "3. Find your extension and click 'Reload'"
    echo ""
    echo "💡 Tip: Keep the extensions page open during development!"
    echo ""
}

# Main menu
case "${1:-menu}" in
    "icons")
        create_placeholder_icons
        ;;
    "validate")
        validate_extension
        ;;
    "package")
        validate_extension
        create_placeholder_icons
        package_extension
        ;;
    "firefox")
        validate_extension
        create_placeholder_icons
        package_firefox_extension
        ;;
    "install")
        show_install_instructions
        ;;
    "reload")
        show_reload_instructions
        ;;
    "menu"|*)
        echo "Available commands:"
        echo "  ./dev.sh icons    - Create placeholder icons"
        echo "  ./dev.sh validate - Validate extension files"
        echo "  ./dev.sh package  - Package extension for Chrome/Edge"
        echo "  ./dev.sh firefox  - Package extension for Firefox"
        echo "  ./dev.sh install  - Show installation instructions"
        echo "  ./dev.sh reload   - Show reload instructions"
        echo ""
        show_reload_instructions
        ;;
esac