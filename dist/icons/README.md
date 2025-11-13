# Icon Placeholder Files

This directory should contain the extension icons in the following sizes:

- `icon-16.png` - 16x16 pixels (toolbar icon)
- `icon-48.png` - 48x48 pixels (extension management page)
- `icon-128.png` - 128x128 pixels (Chrome Web Store)

## Creating Icons

You can create these icons using any image editing software. Here are some recommendations:

### Design Guidelines

- Use a simple, recognizable symbol (like a chain link or checkmark)
- Ensure good contrast for visibility in both light and dark themes
- Keep the design clean and scalable
- Use your brand colors (consider the DevKit.free color scheme)

### Tools

- **Free**: GIMP, Canva, Figma
- **Paid**: Adobe Photoshop, Illustrator, Sketch

### Quick Solution

For development, you can use online icon generators or create simple colored squares as placeholders.

### Example SVG Icon

Here's a simple SVG that you could convert to PNG:

```svg
<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <rect width="128" height="128" fill="#667eea" rx="20"/>
  <path d="M40 64h48M64 40v48" stroke="white" stroke-width="8" stroke-linecap="round"/>
  <circle cx="32" cy="64" r="8" fill="white"/>
  <circle cx="96" cy="64" r="8" fill="white"/>
</svg>
```

This creates a simple link-checking icon with a chain link design.