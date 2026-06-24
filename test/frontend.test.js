import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { setupFrontendRoutes } from '../src/lib/frontend.js';

function startApp() {
  const app = express();
  setupFrontendRoutes(app);
  return new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

test('frontend routes serve the single page app and assets', async () => {
  const { server, baseUrl } = await startApp();
  try {
    for (const route of ['/', '/login', '/report', '/admin', '/summary/1/2026-06-24', '/standup/report']) {
      const res = await fetch(`${baseUrl}${route}`);
      assert.equal(res.status, 200, route);
      assert.match(res.headers.get('content-type'), /text\/html/);
      const html = await res.text();
      assert.match(html, /Zylos Standup/);
      assert.match(html, /standup\.js/);
    }

    let res = await fetch(`${baseUrl}/_assets/standup.js`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /javascript/);
    assert.match(await res.text(), /renderReport/);

    res = await fetch(`${baseUrl}/_assets/standup.css`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/css/);
    assert.match(await res.text(), /color-scheme: dark/);

    res = await fetch(`${baseUrl}/standup/_assets/standup.css`);
    assert.equal(res.status, 200);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
