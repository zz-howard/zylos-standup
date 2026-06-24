#!/usr/bin/env node
/**
 * Pre-upgrade hook for zylos-standup
 *
 * Called by Claude BEFORE CLI upgrade steps.
 * If this hook fails (exit code 1), the upgrade is aborted.
 *
 * This hook handles:
 * - Backup critical data before upgrade
 * - Validate upgrade prerequisites
 * - Stop dependent services if needed
 *
 * Exit codes:
 *   0 - Continue with upgrade
 *   1 - Abort upgrade (with error message)
 */

import fs from 'fs';
import path from 'path';

const HOME = process.env.HOME;
const DATA_DIR = path.join(HOME, 'zylos/components/standup');
const configPath = path.join(DATA_DIR, 'config.json');
const backupDir = path.join(DATA_DIR, 'backups');

console.log('[pre-upgrade] Running standup pre-upgrade checks...\n');

// 1. Backup config before upgrade
if (fs.existsSync(configPath)) {
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `config.${stamp}.json`);
  fs.copyFileSync(configPath, backupPath);
  console.log('Config backed up to:', backupPath);
}

// 2. Add any pre-upgrade validations here
// Example: Check if required services are available
// if (!checkDependency()) {
//   console.error('Error: Required dependency not available');
//   process.exit(1);
// }

console.log('\n[pre-upgrade] Checks passed, proceeding with upgrade.');
