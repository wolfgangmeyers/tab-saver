# tab-saver

A Chrome extension that saves and restores your tab state, including tab groups.

## Features

- **Save All** — snapshot all open tabs and tab groups across all windows in one click
- **Restore** — restore everything, or selectively restore individual tabs or specific groups
- **Remove** — delete saved tabs or groups from your snapshot
- **Re-save group** — update a saved group from a currently open one (or add it if new)

## Install

Requires [Node.js](https://nodejs.org/) and npm.

```bash
npm install
npm run build
```

Then in Chrome:
1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `.output/chrome-mv3/` directory

The extension adds a side panel accessible from the toolbar.

## Development

```bash
# Run tests
npm test

# Build for production
npm run build

# Build and watch for changes
npm run dev
```

## Stack

- [WXT](https://wxt.dev/) — Chrome extension framework (Manifest V3)
- TypeScript
- [Vitest](https://vitest.dev/) — unit tests

## Architecture

```
src/
  lib/
    types.ts      — SavedTab, SavedGroup, SavedState types
    storage.ts    — chrome.storage.local wrappers
    tabs.ts       — chrome.tabs wrappers
    groups.ts     — chrome.tabGroups wrappers
    session.ts    — business logic (save, restore, remove, re-save)
  entrypoints/
    sidepanel/    — side panel UI (vanilla TypeScript)
    background.ts — service worker
```
