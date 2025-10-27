# Area Links

<div align="center">
  <div style="display: flex; justify-content: center; align-items: center; gap: 10px; flex-wrap: wrap;">
    <img src="https://raw.githubusercontent.com/le0booba/Area_Links/refs/heads/main/screen-options-popup-1.png" alt="Area Links Screenshot 1" width="280"/>
    <img src="https://raw.githubusercontent.com/le0booba/Area_Links/refs/heads/main/screen-options-2.png" alt="Area Links Screenshot 2" width="400"/>
  </div>
  
  **Select. Open. Done**
  
  A powerful Chrome extension to select an area on any webpage and instantly open or copy all links within it.

  ![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue?logo=googlechrome)
  ![Manifest V3](https://img.shields.io/badge/Manifest-V3-brightgreen)
  ![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
</div>

---

## 🚀 Quick Start

### Installation

1.  **Download** the [LATEST RELEASE](https://github.com/le0booba/Area_Links/releases/latest) from GitHub.
2.  **Extract** the ZIP file to a permanent folder on your computer.
3.  **Open Chrome** and navigate to the extensions page: `chrome://extensions/`.
4.  **Enable "Developer mode"** using the toggle switch in the top-right corner.
5.  **Click "Load unpacked"** and select the folder where you extracted the files.
6.  **Done!** The Area Links icon will now be available in your browser's toolbar.

### Basic Usage

| Action             | Default Shortcut | Mouse Action                             |
| ------------------ | ---------------- | ---------------------------------------- |
| **Open Links**     | `Alt+Z`          | Hold shortcut, drag a box, then release. |
| **Copy Links**     | `Alt+X`          | Hold shortcut, drag a box, then release. |
| **Cancel Selection** | `Esc`            | Press `Esc` key during an active selection. |

> **Tip:** You can customize keyboard shortcuts anytime at `chrome://extensions/shortcuts`.

> **Note:** The extension does not work on Chrome system pages (New Tab page, Settings, Extensions page, etc.).

---

## 🌟 Features

### Core Functionality
- 🎯 **Visual Area Selection**: An intuitive drag-and-drop interface to select links.
- 🚀 **Dual Operation Modes**: Seamlessly switch between opening links in new tabs or copying them to your clipboard.
- ✨ **Visual Highlighting**: Instantly see which links are inside your selection box before you commit with two color themes.
- 🔗 **Smart Filtering**: Automatically ignores non-http, anchor (`#`), and javascript links.
- 🖱️ **Context Menu Integration**: Activate selection using the right-click menu on any page.

### Customization Options
- 🎨 **4 Selection Box Styles**: Choose from Dashed Blue, Dashed Red, Solid Green, or Subtle Gray theme.
- 🌈 **2 Highlight Styles**: Select between Classic Yellow or Dark Gray highlighting for selected links.
- 📂 **Flexible Opening Behavior**: 
  - Open links in new tabs or a completely new window
  - Position new tabs next to the current tab or at the end
  - Open links in reverse order
  - Allow simultaneous selection on multiple tabs
- 🚫 **Advanced Exclusion Filters**: Exclude links from specific domains or URLs containing certain keywords with import/export functionality.
- ⚙️ **Configurable Tab Limit**: Set a maximum number of tabs to open at once to prevent browser overload (from 1 to 50).
- 🧠 **Duplicate Prevention**: Option to remember recently opened links to avoid opening the same ones again (stores up to 50 URLs).
- 🌍 **Multi-Language Support**: Full UI localization in English and Russian with automatic language detection.

<details>
<summary><b>User Experience Enhancements</b></summary>

- 📱 **Quick Settings Popup**: Click the toolbar icon for a compact menu to toggle common settings on the fly.
- 💾 **Cross-Device Sync**: Your core settings are synced to your Chrome account, providing a consistent experience everywhere.
- 🗑️ **History Management**: Easily clear the list of "remembered" links directly from the options page or popup.
- 📥📤 **Import/Export Exclusions**: Backup and restore your exclusion lists with JSON file support.
- 😌 **Lightweight & Fast**: Built to be efficient with optimized link scanning and rendering performance using IntersectionObserver API.
- 🎭 **Custom Cursors**: Dedicated cursor styles for copy and open modes for clear visual feedback.
- 🎬 **Smooth Animations**: Optimized rendering with requestAnimationFrame for smooth performance.

</details>

---

## 📋 Use Cases

This extension is perfect for:
- **📚 Researchers**: Quickly open dozens of citations, search results, or articles.
- **🛍️ Online Shoppers**: Easily compare multiple product listings across different tabs.
- **👨‍💻 Developers**: Open all links from a project's dependency list or API documentation.
- **📖 Content Curators**: Gather a list of links from an article or blog for sharing.
- **📰 News Readers**: Open all headlines from a news aggregator's front page in one go.
- **🎓 Students**: Collect research materials from academic databases efficiently.

---

## ⚙️ Configuration

### Quick Settings (Extension Popup)
Click the extension icon in your toolbar for instant access to toggle:
-   `Open in new window`
-   `Open next to current`
-   `Remember opened links`
-   `Remove duplicates on copy`

The popup also provides quick action buttons to activate selection modes and clear link history.

### Advanced Settings (Options Page)

<details>
<summary><b>View All Advanced Settings</b></summary>

| Setting | Description | Default |
|---|---|---|
| **Tab Limit** | Set the maximum number of tabs to open in a single action. | `15` |
| **Selection Style** | Changes the visual appearance of the selection box. Options: Dashed Blue, Dashed Red, Solid Green, Subtle Gray. | `Dashed Blue` |
| **Highlight Style** | Changes the color scheme for highlighted links within selection. Options: Classic Yellow, Dark Gray. | `Classic Yellow` |
| **Open in new window** | Opens all selected links in a new browser window instead of tabs. | `Off` |
| **Open in reverse order** | Opens links in reverse order (bottom to top). | `Off` |
| **Open next to current** | Opens new tabs immediately after the current tab instead of at the end. | `Off` |
| **Allow activation on multiple tabs** | Permits selection mode to be active on multiple tabs simultaneously. | `Off` |
| **Remember opened links** | Prevents re-opening of previously opened links (stores last 50 URLs). | `On` |
| **Remove duplicates on copy** | Removes duplicate URLs when copying links to clipboard. | `On` |
| **Excluded Domains** | Comma-separated list of domains to ignore (e.g., `google.com, twitter.com`). | `(empty)` |
| **Excluded Words** | Comma-separated list of keywords to ignore in link URLs (e.g., `logout, unsubscribe`). | `(empty)` |
| **Import/Export Exclusions** | Backup and restore your exclusion lists via JSON files with conflict resolution. | `N/A` |
| **Show in context menu** | Toggles the "Open/Copy Links" options in the right-click menu. | `On` |
| **Language** | Switch the extension's display language between supported locales. | `Auto-detect` |
| **Clear History** | A button to clear the list of links remembered by the "Remember opened links" feature. | `N/A` |

###### HISTORY_LIMIT = 50 (const)

</details>

---

## 🔒 Permissions & Privacy

This extension was built with your privacy as a top priority.

-   **🚫 Zero Tracking**: No analytics, telemetry, or user data is ever collected.
-   **🔒 Offline First**: All processing happens locally in your browser. The extension makes no external network requests.
-   **🗑️ Transparent Storage**: You have full control over the data stored by the extension and can clear it at any time.

### Data Handling

<details>
<summary><strong>🏠 Local Storage (<code>chrome.storage.local</code>)</strong> - This data is stored only on your computer and is NOT synced to your Google Account.</summary>

-   `linkHistory`: Stores a list of the last 50 unique URLs you opened using the extension, if `useHistory` is enabled.
-   `excludedDomains`: Comma-separated list of domains to exclude from link operations.
-   `excludedWords`: Comma-separated list of keywords to exclude from link URLs.
-   `useHistory`: A true/false setting for whether to remember opened links.
-   `checkDuplicatesOnCopy`: A true/false setting for whether to remove duplicate links when copying.
</details>

<details>
<summary><strong>☁️ Sync Storage (<code>chrome.storage.sync</code>)</strong> - These settings are synced across all browsers where you are logged into your Chrome account.</summary>

-   Core settings including `tabLimit`, `selectionStyle`, `highlightStyle`, `openInNewWindow`, `openNextToParent`, `reverseOrder`, `allowMultiTabActivation`, `language`, and `showContextMenu`.
</details>

<details>
<summary><strong>⚡ Session Storage (<code>chrome.storage.session</code>)</strong> - Temporary cache cleared when browser closes.</summary>

-   `settingsCache`: Performance optimization cache for frequently accessed settings.
</details>

### Required Permissions

<details>
<summary><b>View Permission Explanations</b></summary>

| Permission         | Purpose                                                                   |
| ------------------ | ------------------------------------------------------------------------- |
| `storage`          | To save your settings and link history.                                   |
| `tabs`             | To open links in new tabs and create new windows.                         |
| `scripting`        | To inject the code that draws the selection box onto web pages.           |
| `contextMenus`     | To add the activation options to your right-click menu for easy access.   |
| `http://*/*`, `https://*/*` | To allow the extension to run on any website you visit.     |

*We only request permissions that are essential for the extension's core functionality.*

</details>

---

## 🛠️ Troubleshooting

<details>
<summary><b>Extension doesn't work on certain pages (e.g., New Tab page)</b></summary>
  
**Cause:** For security reasons, Chrome extensions are not allowed to run on internal `chrome://` pages (like Settings, Bookmarks, or the Extensions page itself), the Chrome Web Store, or other protected browser pages.

**Solution:** This is expected behavior. The extension will function correctly on standard websites.
</details>

<details>
<summary><b>Keyboard shortcuts are not working</b></summary>
  
**Cause:** Another extension might be using the same shortcuts, or the shortcuts might have been changed.

**Solution:**
1.  Navigate to `chrome://extensions/shortcuts`.
2.  Find "Area Links" in the list.
3.  Check for any conflicts and reassign the shortcuts if needed.
</details>

<details>
<summary><b>No links are opening even after I make a selection</b></summary>
  
**Cause:** The links might be filtered out by your settings, or the selection area might not contain valid links.

**Solution:**
1.  Ensure your selection box covers actual, clickable `<a>` links.
2.  Check your **Options Page** to see if the links are being blocked by your **Excluded Domains** or **Excluded Words** filters.
3.  If you have "Remember opened links" enabled, try clearing the history via the Options Page or popup.
</details>

<details>
<summary><b>Selection box doesn't appear or behaves unexpectedly</b></summary>
  
**Cause:** The content script may not have loaded properly on the page.

**Solution:**
1. Try refreshing the page.
2. If the issue persists, the extension will automatically inject scripts when you use the shortcut or context menu.
3. Check if any other extensions might be interfering with page scripts.
</details>

<details>
<summary><b>Performance issues on pages with many links</b></summary>
  
**Cause:** Pages with thousands of links may experience slower performance during selection.

**Solution:**
1. The extension uses IntersectionObserver to optimize performance by only tracking visible links.
2. On extremely large pages, consider selecting smaller areas.
3. Close unnecessary tabs to free up browser resources.
</details>

---

## 📁 Project Structure

```
Area_Links/
├── 🌍 _locales/              # Language files for internationalization (i18n)
│   ├── 🔤 en/messages.json   # English localization strings
│   └── 🔤 ru/messages.json   # Russian localization strings
├── 🖼️ icons/                 # Application and branding icons
│   ├── 🖼️ icon16.png         # Icon for browser toolbar (16x16)
│   ├── 🖼️ icon48.png         # Icon for extensions management page (48x48)
│   └── 🖼️ icon128.png        # Icon for the Chrome Web Store (128x128)
├── 🧠 background.js          # Service worker for event handling and settings management
├── ⚡ content.js             # Injects selection logic and UI into web pages
├── 🎨 styles.css             # CSS for the selection box and link highlights
├── 🧩 manifest.json          # The extension's manifest file (Manifest V3)
├── 🎛️🖥️ options.html         # The full settings page UI
├── 🎛️ options.css            # Styling for the options page
├── 🎛️ options.js             # Logic for the settings page
├── 💬🖥️ popup.html           # The extension's popup UI
├── 💬 popup.css              # Styling for the popup
├── 💬 popup.js               # Logic for the popup quick settings
├── 📄 LICENSE                # MIT License
└── ℹ️ README.md              # This documentation file
```

---

## 🔧 Technical Details

### Performance Optimizations
- **IntersectionObserver API**: Efficiently tracks only visible links on the page, reducing memory usage on large pages.
- **RequestAnimationFrame**: Smooth selection box rendering and link highlighting updates.
- **Settings Cache**: Session storage cache minimizes repeated storage API calls.
- **Lazy Script Injection**: Content scripts are injected on-demand only when needed.

### Browser Compatibility
- Built with **Manifest V3** for modern Chrome extensions
- Requires Chrome/Chromium-based browsers (Chrome, Edge, Brave, etc.)
- Minimum Chrome version: 88+

---

<div align="center">
  
  **Made with ❤️ by badrenton**
  
  *© 2025 • If you find this extension helpful, please consider giving it a ⭐ on GitHub!*
</div>
