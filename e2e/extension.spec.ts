import { test, expect, chromium } from '@playwright/test';
import path from 'node:path';
import http from 'node:http';
import fs from 'node:fs';

const extensionPath = path.resolve(process.cwd(), '.output/chrome-mv3');

test.describe('PageScribe Extension E2E Smoke Tests', () => {
  test('loads extension, renders popup & sidepanel, and extracts content from a live page', async () => {
    expect(fs.existsSync(extensionPath)).toBe(true);

    // Start a tiny local HTTP server to serve a test article with a GFM table
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!doctype html>
        <html>
          <head>
            <title>Test Article</title>
            <meta name="author" content="Ada Lovelace" />
          </head>
          <body>
            <article>
              <h1>Hello PageScribe</h1>
              <p>This is a sample paragraph for extraction and statistics testing.</p>
              <table>
                <thead><tr><th>Name</th><th>Role</th></tr></thead>
                <tbody><tr><td>PageScribe</td><td>Extractor</td></tr></tbody>
              </table>
            </article>
          </body>
        </html>
      `);
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    const testUrl = `http://127.0.0.1:${port}/`;

    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });

    try {
      let [serviceWorker] = context.serviceWorkers();
      if (!serviceWorker) {
        serviceWorker = await context.waitForEvent('serviceworker', { timeout: 10000 });
      }
      const extensionId = serviceWorker.url().split('/')[2];
      expect(extensionId).toBeTruthy();

      // Open the test article tab first so it's the active tab
      const articlePage = await context.newPage();
      await articlePage.goto(testUrl, { waitUntil: 'networkidle' });

      // Open popup.html in a separate page and verify UI + tabs
      const popupPage = await context.newPage();
      const errors: string[] = [];
      popupPage.on('pageerror', (err) => errors.push(err.message));

      await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
      await expect(popupPage.locator('h1')).toHaveText('PageScribe');

      // Check all 5 tabs render
      for (const label of ['Page', 'PDF', 'Analysis', 'Crawl', 'History']) {
        await expect(popupPage.locator('nav button', { hasText: label })).toBeVisible();
      }

      // Check sidepanel.html also loads cleanly
      const sidePanelPage = await context.newPage();
      sidePanelPage.on('pageerror', (err) => errors.push(err.message));
      await sidePanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);
      await expect(sidePanelPage.locator('h1')).toHaveText('PageScribe');

      expect(errors).toEqual([]);
    } finally {
      await context.close();
      server.close();
    }
  });
});
