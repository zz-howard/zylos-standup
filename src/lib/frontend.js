import express from 'express';
import path from 'node:path';

const distDir = path.join(import.meta.dirname, '..', '..', 'dist');
const assetsDir = path.join(distDir, 'assets');
const indexPath = path.join(distDir, 'index.html');

export function setupFrontendRoutes(app) {
  app.use('/assets', express.static(assetsDir, { immutable: true, maxAge: '1y' }));
  app.use('/standup/assets', express.static(assetsDir, { immutable: true, maxAge: '1y' }));
  app.use(express.static(distDir, { index: false, maxAge: '1h' }));
  app.use('/standup', express.static(distDir, { index: false, maxAge: '1h' }));

  const renderApp = (req, res, next) => {
    if (
      req.path.startsWith('/api/') ||
      req.path.startsWith('/standup/api/') ||
      req.path.startsWith('/assets/') ||
      req.path.startsWith('/standup/assets/')
    ) {
      return next();
    }
    if (!req.path.startsWith('/standup')) {
      return res.redirect(302, `/standup${req.path === '/' ? '/' : req.path}`);
    }
    return res.sendFile(indexPath);
  };

  app.get('*', renderApp);
}
