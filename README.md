# Area Links

<div align="center">
  <div style="display: flex; justify-content: center; align-items: center; gap: 10px; flex-wrap: wrap;">
    <img src="https://raw.githubusercontent.com/le0booba/Area_Links/refs/heads/main/screen-options.png" alt="Area Links Screenshot 2" width="380"/>
    <img src="https://raw.githubusercontent.com/le0booba/Area_Links/refs/heads/main/screen-options-popup.png" alt="Area Links Screenshot 1" width="210"/>
  </div>

  **Select. Open. Done**
  
  **English** | **[Русский](README.ru.md)**
  
  Select any area on a webpage and open or copy all links inside with one action.

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
| **Cancel Selection** | `Esc`          | Press `Esc` key during an active selection. |

> **Tip:** You can customize keyboard shortcuts anytime at `chrome://extensions/shortcuts`.

> **Note:** The extension does not work on Chrome system pages (New Tab page, Settings, Extensions page, etc.).

---

## 🌟 Features

### Core Features
- 🎯 **Visual Area Selection**: Drag-and-drop interface to select links on any webpage.
- 🚀 **Dual Operation Modes**: Open links in new tabs or copy them to your clipboard.
- ✨ **Visual Highlighting**: See which links are inside your selection box with three color themes (Classic Yellow, Green Highlighter, Dark Gray).
- 🎨 **Customizable Selection Box**: Choose from four border styles (Solid, Dashed, Dotted, Subtle) and customize the color with a color picker plus four saveable preset slots.
- 🔗 **Smart Filtering**: Automatically skips invisible and sub-pixel elements (≤ 1px) during link detection. Use domain and keyword exclusion filters for fine-grained URL-level control.
- 🖱️ **Context Menu Integration**: Activate selection using the right-click menu on any page.
- 📂 **Flexible Opening Behavior**: Open links in new tabs or a completely new window, position new tabs next to the current tab or at the end, open links in reverse order.
- ⚙️ **Configurable Tab Limit**: Set a maximum number of tabs to open at once (from 1 to 50).

### Advanced Options
- 🚫 **Exclusion Filters**: Exclude links from specific domains or URLs containing certain keywords.
- 📥📤 **Import/Export Settings**: Backup and restore your exclusion lists or all settings with JSON file support and automatic conflict resolution.
- 🧠 **History Tracking**: Separate history for opened and copied links with option to remember up to 50 URLs for each mode.
- 🗑️ **Duplicate Detection**: Remove duplicate URLs within the current selection or prevent re-opening previously opened links.
- 💾 **Cross-Device Sync**: Your core settings are synced to your Chrome account.
- 📱 **Quick Settings Popup**: Click the toolbar icon for instant access to common settings with separate controls for Open and Copy modes.
- 🌐 **Multi-Language Support**: Full UI localization in English and Russian with automatic language detection.
- 🎭 **Custom Cursors**: Dedicated cursor styles for copy and open modes for clear visual feedback.
- 🎬 **Smooth Animations**: CSS transitions for visual feedback when highlighting links.
- 📋 **Smart Clipboard Handling**: Fallback mechanism for copying links in non-secure contexts.

---

## ⚙️ Configuration

### Quick Settings (Extension Popup)
Click the extension icon in your toolbar for instant access to toggle:

**Open Mode Settings:**
-   `Open next to current`
-   `Remember opened links`
-   `Remove duplicates`

**Copy Mode Settings:**
-   `Remember copied links`
-   `Remove duplicates`

The popup also provides quick action buttons to activate selection modes and clear link history.

### Advanced Settings (Options Page)

<details>
<summary><b>View All Advanced Settings</b></summary>

| Setting | Description | Default |
|---|---|---|
| **Tab Limit** | Set the maximum number of tabs to open in a single action. | `15` |
| **Selection Box Style** | Changes the border style of the selection box. Options: Solid, Dashed, Dotted, Subtle. | `Solid` |
| **Selection Box Color** | Customize the color of the selection box with a color picker. Includes four saveable preset slots for quick color switching. | `#007bff` (Blue) |
| **Link Highlight Style** | Changes the color scheme for highlighted links within selection. Options: Classic Yellow, Green Highlighter, Dark Gray. | `Classic Yellow` |
| **Open in new window** | Opens all selected links in a new browser window instead of tabs. | `Off` |
| **Open in reverse order** | Opens links in reverse order (bottom to top). | `Off` |
| **Open next to current** | Opens new tabs immediately after the current tab instead of at the end. | `On` |
| **Remember opened links** | Prevents re-opening of previously opened links (stores last 50 URLs). | `On` |
| **Remember copied links** | Prevents re-copying of previously copied links (stores last 50 URLs). | `Off` |
| **Remove duplicates (Open)** | Removes duplicate URLs within the current selection when opening. | `On` |
| **Remove duplicates (Copy)** | Removes duplicate URLs within the current selection when copying. | `On` |
| **Apply exclusions on copy** | Applies domain and keyword exclusion filters when copying links (normally only applied when opening). | `Off` |
| **Excluded Domains** | Comma-separated list of domains to ignore (e.g., `google.com, twitter.com`). Supports international domains with Punycode conversion. | `(empty)` |
| **Excluded Words** | Comma-separated list of keywords to ignore in link URLs (e.g., `logout, unsubscribe`). | `(empty)` |
| **Import/Export Exclusions** | Backup and restore your exclusion lists via JSON files with automatic conflict resolution. | `N/A` |
| **Import/Export Settings** | Backup and restore all extension settings including exclusions via JSON files. | `N/A` |
| **Show in context menu** | Toggles the "Open/Copy Links" options in the right-click menu. | `Off` |
| **Language** | Switch the extension's display language between supported locales (English, Russian). | `Auto-detect` |
| **Clear History** | A button to clear the list of links remembered by both "Remember opened links" and "Remember copied links" features. | `N/A` |

###### HISTORY_LIMIT = 50 (const)

</details>

---

## 🔧 Technical Details

<details>
<summary><b>View Technical Details</b></summary>

### Performance Optimizations

Area Links is engineered for near-zero runtime overhead and smooth 60fps interaction even on pages with thousands of links:

*   **💤 Lazy Dynamic Injection:** Content scripts and styles are not loaded automatically on pages. They are dynamically injected via `chrome.scripting` only upon trigger, saving RAM and CPU.
*   **📐 One-Pass Geometry Caching (Zero Layout Thrashing):** Bounding boxes for all links (`getBoundingClientRect`) are calculated *once* on `mousedown`. During mouse drag, intersection tests rely exclusively on plain in-memory coordinate comparisons with zero DOM reflows.
*   **🎞️ Frame-Bound Rendering:** Selection updates are tied to the browser's refresh rate via `requestAnimationFrame` with passive scroll listeners, ensuring stutter-free rendering without event flooding.
*   **🎯 DOM Mutation Diffing:** Links only trigger DOM updates (`classList`) when their selection state actually changes (`status !== newStatus`), drastically reducing layout/paint recalculations.
*   **⚡ Lazy URL Parsing & O(1) Lookups:** Expensive URL decoding and domain extractions (`new URL()`) are performed only for links within the active selection and are memoized. History and duplication checks use native `Set.has()` lookups ($O(1)$).
*   **🧹 Strict Memory Cleanup:** Immediately upon release or cancellation, all DOM nodes, listeners, and cached data structures are destroyed to prevent memory leaks.

### Smart Behaviors
- **Automatic Tab Switching Prevention**: Automatically resets selection when switching to a different tab
- **Link Element Filtering**: Skips invisible and sub-pixel elements (`width ≤ 1px` or `height ≤ 1px`) during link caching; domain and keyword exclusion filters provide URL-level control
- **Duplicate Detection**: Multiple mechanisms to prevent duplicate link opening/copying with separate history tracking for each mode
- **International Domain Support**: Proper handling of international domains with automatic Punycode conversion for exclusion filters
- **Graceful Degradation**: Fallback clipboard copy method (`document.execCommand`) for non-secure contexts

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
-   `copyHistory`: Stores a list of the last 50 unique URLs you copied using the extension, if `useCopyHistory` is enabled.
-   `excludedDomains`: Comma-separated list of domains to exclude from link operations.
-   `excludedWords`: Comma-separated list of keywords to exclude from link URLs.
-   `useHistory`: A true/false setting for whether to remember opened links.
-   `useCopyHistory`: A true/false setting for whether to remember copied links.
</details>

<details>
<summary><strong>☁️ Sync Storage (<code>chrome.storage.sync</code>)</strong> - These settings are synced across all browsers where you are logged into your Chrome account.</summary>

-   Core settings including `tabLimit`, `selectionBoxStyle`, `selectionBoxColor`, `highlightStyle`, `openInNewWindow`, `openNextToParent`, `reverseOrder`, `applyExclusionsOnCopy`, `removeDuplicatesInSelection`, `checkDuplicatesOnCopy`, `language`, `showContextMenu`, and color preset slots (`selectionColorCustomPreset0-3`).
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
| `http://*/*`, `https://*/*` | To allow the extension to run on any website you visit.      |

*We only request permissions that are essential for the extension's core functionality.*

</details>

---

## 📁 Project Structure

```
Area_Links/
├── 🌐 _locales/              # Language files for internationalization (i18n)
│   ├── 📦 en/messages.json   # English localization strings
│   └── 📦 ru/messages.json   # Russian localization strings
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

<div align="center">
  
  **Made with ❤️ by badrenton**
  
  *© 2026 • If you find this extension helpful, please consider giving it a ⭐ on GitHub!*
</div>
