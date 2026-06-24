import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import test from 'node:test';
import { setupFrontendRoutes } from '../src/lib/frontend.js';

const distDir = path.join(import.meta.dirname, '..', 'dist');
const indexPath = path.join(distDir, 'index.html');

function startApp() {
  const app = express();
  setupFrontendRoutes(app);
  return new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

function extractAssetUrls(html) {
  const urls = [];
  for (const match of html.matchAll(/<(?:script|link)\b[^>]+(?:src|href)="([^"]+)"/g)) {
    urls.push(match[1]);
  }
  return urls.filter(url => url.startsWith('/standup/assets/'));
}

test('frontend routes serve the built single page app and Vite assets', async () => {
  assert.ok(fs.existsSync(indexPath), 'dist/index.html must exist');

  const { server, baseUrl } = await startApp();
  try {
    const indexHtml = fs.readFileSync(indexPath, 'utf8');
    assert.match(indexHtml, /Zylos Standup/);
    const assetUrls = extractAssetUrls(indexHtml);
    assert.ok(assetUrls.length >= 2, 'expected built script and stylesheet asset URLs');
    assert.ok(assetUrls.every(url => url.startsWith('/standup/assets/')));

    for (const route of ['/', '/report', '/standup/report', '/summary/1/2026-06-25', '/standup/summary/1/2026-06-25']) {
      const res = await fetch(`${baseUrl}${route}`);
      assert.equal(res.status, 200, route);
      assert.match(res.headers.get('content-type'), /text\/html/);
      const html = await res.text();
      assert.match(html, /Zylos Standup/);
      assert.deepEqual(extractAssetUrls(html), assetUrls);
    }

    for (const assetUrl of assetUrls) {
      const strippedUrl = assetUrl.replace(/^\/standup/, '');
      for (const route of [strippedUrl, assetUrl]) {
        const res = await fetch(`${baseUrl}${route}`);
        assert.equal(res.status, 200, route);
        assert.match(res.headers.get('content-type'), /\.(js)$/.test(route) ? /javascript/ : /text\/css/);
      }
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
