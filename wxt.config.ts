import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'tab-saver',
    description: 'Save and restore tab sessions with groups',
    version: '1.0.0',
    minimum_chrome_version: '114',
    permissions: ['tabs', 'tabGroups', 'storage', 'sidePanel', 'windows', 'contextMenus'],
    side_panel: {
      default_path: 'sidepanel/index.html',
    },
  },
  browser: 'chrome',
});
