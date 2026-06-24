import express from 'express';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const V = pkg.version;

const HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Zylos Standup</title>
  <link rel="stylesheet" href="./_assets/standup.css?v=${V}">
</head>
<body>
  <div id="app" class="app-shell" data-loading="true"></div>
  <script src="./_assets/standup.js?v=${V}" defer></script>
</body>
</html>`;

export function setupFrontendRoutes(app) {
  const assetsDir = path.join(import.meta.dirname, '..', '..', 'assets');
  app.use('/_assets', express.static(assetsDir, { maxAge: '1h' }));
  app.use('/standup/_assets', express.static(assetsDir, { maxAge: '1h' }));

  const renderApp = (_req, res) => {
    res.type('html').send(HTML);
  };

  app.get('/', renderApp);
  app.get('/login', renderApp);
  app.get('/report', renderApp);
  app.get('/admin', renderApp);
  app.get('/summary/:team/:date', renderApp);

  // Direct local access without Caddy strip-prefix.
  app.get('/standup', renderApp);
  app.get('/standup/login', renderApp);
  app.get('/standup/report', renderApp);
  app.get('/standup/admin', renderApp);
  app.get('/standup/summary/:team/:date', renderApp);
}
