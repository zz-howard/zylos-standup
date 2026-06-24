/**
 * Configuration loader for zylos-standup
 *
 * Loads config from ~/zylos/components/standup/config.json
 * with hot-reload support via file watcher.
 */

import fs from 'node:fs';
import path from 'node:path';

const HOME = process.env.HOME;
export const DATA_DIR = process.env.STANDUP_DATA_DIR || path.join(HOME, 'zylos/components/standup');
export const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
export const DB_PATH = process.env.STANDUP_DB_PATH || path.join(DATA_DIR, 'standup.db');
export const LOGS_DIR = path.join(DATA_DIR, 'logs');
export const PAGES_STANDUP_DIR = process.env.STANDUP_PAGES_DIR
  || path.join(HOME, 'zylos/http/public/pages/standup');

// Default configuration
export const DEFAULT_CONFIG = {
  schemaVersion: 1,
  enabled: true,
  port: 3475,
  auth: {
    enabled: true,
    sessionTtlHours: 12,
    rememberTtlDays: 30,
  },
  reports: {
    defaultTimezone: 'Asia/Singapore',
    pagesDir: PAGES_STANDUP_DIR,
    defaultPrompt: [
      'What did you do since your last update?',
      'What are you planning to do next?',
      'Any blockers or risks?',
    ],
  },
  ai: {
    default: { provider: 'auto', runtime: 'auto', model: 'auto', effort: 'medium' },
    summary: {},
    report: {},
  },
};

let config = null;
let configWatcher = null;

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source || {})) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * Load configuration from file
 * @returns {Object} Configuration object
 */
export function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const content = fs.readFileSync(CONFIG_PATH, 'utf8');
      config = deepMerge(DEFAULT_CONFIG, JSON.parse(content));
    } else {
      console.warn(`[standup] Config file not found: ${CONFIG_PATH}`);
      config = { ...DEFAULT_CONFIG };
    }
  } catch (err) {
    console.error(`[standup] Failed to load config: ${err.message}`);
    config = { ...DEFAULT_CONFIG };
  }
  return config;
}

/**
 * Get current configuration
 * @returns {Object} Configuration object
 */
export function getConfig() {
  if (!config) {
    loadConfig();
  }
  if (process.env.STANDUP_PORT) {
    config.port = parseInt(process.env.STANDUP_PORT, 10);
  }
  return config;
}

/**
 * Save configuration to file
 * @param {Object} newConfig - Configuration to save
 */
export function saveConfig(newConfig) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    let fileConfig = {};
    if (fs.existsSync(CONFIG_PATH)) {
      fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
    const merged = deepMerge(fileConfig, newConfig);
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2) + '\n');
    config = deepMerge(DEFAULT_CONFIG, merged);
  } catch (err) {
    console.error(`[standup] Failed to save config: ${err.message}`);
    throw err;
  }
  return config;
}

/**
 * Start watching config file for changes
 * @param {Function} onChange - Callback when config changes
 */
export function watchConfig(onChange) {
  if (configWatcher) {
    configWatcher.close();
  }

  if (fs.existsSync(CONFIG_PATH)) {
    configWatcher = fs.watch(CONFIG_PATH, (eventType) => {
      if (eventType === 'change') {
        console.log('[standup] Config file changed, reloading...');
        loadConfig();
        if (onChange) {
          onChange(config);
        }
      }
    });
  }
}

/**
 * Stop watching config file
 */
export function stopWatching() {
  if (configWatcher) {
    configWatcher.close();
    configWatcher = null;
  }
}
