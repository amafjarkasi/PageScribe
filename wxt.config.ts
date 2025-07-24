import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'PageScribe',
    description: 'A powerful web content extraction and crawling tool.',
    host_permissions: ['<all_urls>'],
    permissions: ['tabs', 'storage', 'downloads'],
  },
});
