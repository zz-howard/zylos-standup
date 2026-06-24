#!/usr/bin/env node
/**
 * zylos-standup
 *
 * AI-assisted async daily standup tool
 */

import express from 'express';
import { getConfig, watchConfig, DATA_DIR } from './lib/config.js';
import { cleanupExpiredSessions, setupAuthRoutes } from './lib/auth.js';
import { closeDb, getDb } from './lib/db.js';

// Initialize
console.log(`[standup] Starting...`);
console.log(`[standup] Data directory: ${DATA_DIR}`);

// Load configuration
let config = getConfig();
console.log(`[standup] Config loaded, enabled: ${config.enabled}`);

if (!config.enabled) {
  console.log(`[standup] Component disabled in config, exiting.`);
  process.exit(0);
}

// Watch for config changes
watchConfig((newConfig) => {
  console.log(`[standup] Config reloaded`);
  config = newConfig;
  if (!newConfig.enabled) {
    console.log(`[standup] Component disabled, stopping...`);
    shutdown();
  }
});

// Main component logic
let server = null;
let cleanupTimer = null;

async function main() {
  getDb();
  cleanupTimer = setInterval(() => cleanupExpiredSessions(), 300_000);
  cleanupTimer.unref?.();

  const app = express();
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });

  setupAuthRoutes(app);

  // TODO: Implement your component logic here
  //
  // Communication components: set up platform SDK, listen for events, forward to C4
  // Capability components: start HTTP server or other service interface
  // Utility components: run task and exit (remove the keepalive below)

  server = app.listen(config.port, '127.0.0.1', () => {
    console.log(`[standup] Server listening on 127.0.0.1:${config.port}`);
  });
}

// Graceful shutdown
function shutdown() {
  console.log(`[standup] Shutting down...`);
  if (cleanupTimer) clearInterval(cleanupTimer);
  if (server) {
    server.close(() => {
      closeDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref?.();
    return;
  }
  closeDb();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Run
main().catch(err => {
  console.error(`[standup] Fatal error:`, err);
  process.exit(1);
});
