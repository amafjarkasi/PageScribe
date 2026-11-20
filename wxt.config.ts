import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  hooks: {
    'build:manifestGenerated': (_wxt, manifest) => {
      delete manifest.host_permissions;
    },
  },
  manifest: {
    name: 'PageScribe',
    description: 'Manifest V3 Chrome extension for clean web-to-Markdown clipping, Obsidian export, PDF parsing, AI Q&A, and polite multi-page crawling.',
    optional_host_permissions: ['<all_urls>'],
    permissions: [
      'activeTab',
      'tabs',
      'storage',
      'downloads',
      'scripting',
      'offscreen',
      'sidePanel',
      'contextMenus',
    ],
    side_panel: {
      default_path: 'sidepanel.html',
    },
    commands: {
      'save-page-markdown': {
        suggested_key: {
          default: 'Alt+Shift+M',
          mac: 'Alt+Shift+M',
        },
        description: 'Save current page as Markdown',
      },
      'open-side-panel': {
        suggested_key: {
          default: 'Alt+Shift+P',
          mac: 'Alt+Shift+P',
        },
        description: 'Open PageScribe Side Panel',
      },
    },
  },
});
