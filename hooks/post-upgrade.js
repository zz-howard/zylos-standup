#!/usr/bin/env node
/**
 * Post-upgrade hook for zylos-standup
 *
 * Called by Claude after CLI upgrade completes (zylos upgrade --json).
 * CLI handles: stop service, backup, file sync, npm install, manifest.
 *
 * This hook handles component-specific migrations:
 * - Config schema migrations
 * - Data format updates
 *
 * Note: Service restart is handled by Claude after this hook.
 */

import fs from 'fs';
import path from 'path';
import { DEFAULT_CONFIG } from '../src/lib/config.js';

const HOME = process.env.HOME;
const DATA_DIR = path.join(HOME, 'zylos/components/standup');
const configPath = path.join(DATA_DIR, 'config.json');

function deepMergeMissing(target, defaults) {
  const result = { ...target };
  for (const [key, value] of Object.entries(defaults || {})) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      result[key] &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMergeMissing(result[key], value);
    } else if (result[key] === undefined) {
      result[key] = value;
    }
  }
  return result;
}

function collectAddedKeys(before, after, prefix = '') {
  const added = [];
  for (const [key, value] of Object.entries(after || {})) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (before[key] === undefined) {
      added.push(name);
    } else if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      before[key] &&
      typeof before[key] === 'object' &&
      !Array.isArray(before[key])
    ) {
      added.push(...collectAddedKeys(before[key], value, name));
    }
  }
  return added;
}

console.log('[post-upgrade] Running standup-specific migrations...\n');

// Config migrations
if (fs.existsSync(configPath)) {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const migratedConfig = deepMergeMissing(config, DEFAULT_CONFIG);
    const migrations = collectAddedKeys(config, migratedConfig);

    // Save if migrated
    if (migrations.length) {
      fs.writeFileSync(configPath, JSON.stringify(migratedConfig, null, 2) + '\n', { mode: 0o600 });
      console.log('Config migrations applied:');
      migrations.forEach(m => console.log('  - Added ' + m));
    } else {
      console.log('No config migrations needed.');
    }
  } catch (err) {
    console.error('Config migration failed:', err.message);
    process.exit(1);
  }
} else {
  console.log('No config file found, skipping migrations.');
}

console.log('\n[post-upgrade] Complete!');
