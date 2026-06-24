#!/usr/bin/env node
/**
 * Post-install hook for zylos-standup
 *
 * Called by zylos after configure hook and CLI installation.
 * CLI handles: download, npm install, manifest, registration.
 * zylos/agent handles: config collection, configure hook, this hook, service start.
 *
 * This hook handles component-specific setup:
 * - Create subdirectories
 * - Create default config.json when no configure hook values were provided
 * - Verify required config fields if needed
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { hashPassword } from '../src/lib/auth.js';
import { DEFAULT_CONFIG } from '../src/lib/config.js';
import {
  closeDb,
  createMember,
  createTeam,
  getDb,
  getMemberByUsername,
  listTeams,
} from '../src/lib/db.js';

const HOME = process.env.HOME;
const DATA_DIR = path.join(HOME, 'zylos/components/standup');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const DEFAULT_TEAM_NAME = 'Default';
const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_DISPLAY_NAME = 'Admin';

function deepMerge(target, source) {
  const result = { ...target };
  for (const [key, value] of Object.entries(source || {})) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      result[key] &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key], value);
    } else if (result[key] === undefined) {
      result[key] = value;
    }
  }
  return result;
}

function writeJson(filePath, value, options = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(value, null, 2) + '\n', options);
  fs.renameSync(tmpPath, filePath);
}

function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return null;
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

console.log('[post-install] Running standup-specific setup...\n');

// 1. Create subdirectories
console.log('Creating subdirectories...');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'logs'), { recursive: true });
console.log('  - logs/');

// 2. Create default config if not exists
if (!fs.existsSync(CONFIG_PATH)) {
  console.log('\nCreating default config.json...');
  writeJson(CONFIG_PATH, DEFAULT_CONFIG, { mode: 0o600 });
  console.log('  - config.json created');
} else {
  const merged = deepMerge(readConfig(), DEFAULT_CONFIG);
  writeJson(CONFIG_PATH, merged, { mode: 0o600 });
  console.log('\nConfig already exists, ensured defaults.');
}

// 3. Initialize database and first admin user
console.log('\nInitializing database...');
const database = getDb();
const teams = listTeams();
let team = teams.find(row => row.name === DEFAULT_TEAM_NAME) || teams[0];
if (!team) {
  team = createTeam({
    name: DEFAULT_TEAM_NAME,
    timezone: DEFAULT_CONFIG.reports.defaultTimezone,
  });
  console.log(`  - created team: ${team.name}`);
}

const existingAdmin = getMemberByUsername(DEFAULT_ADMIN_USERNAME);
if (!existingAdmin) {
  const generatedPassword = cryptoRandomPassword();
  const { passwordHash, passwordSalt } = hashPassword(generatedPassword);
  createMember({
    teamId: team.id,
    username: DEFAULT_ADMIN_USERNAME,
    displayName: DEFAULT_ADMIN_DISPLAY_NAME,
    role: 'admin',
    passwordHash,
    passwordSalt,
  });
  console.log('  - created initial admin user');
  console.log('\n  Save this password. It is shown once:');
  console.log(`  Username: ${DEFAULT_ADMIN_USERNAME}`);
  console.log(`  Password: ${generatedPassword}`);
} else {
  console.log('  - initial admin user already exists, skipping');
}

database.pragma('wal_checkpoint(TRUNCATE)');
closeDb();

console.log('\n[post-install] Complete!');

function cryptoRandomPassword() {
  return crypto.randomBytes(18).toString('base64url');
}
