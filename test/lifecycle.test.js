import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';

const repoRoot = path.resolve(import.meta.dirname, '..');

function runHook(script, { home, input } = {}) {
  return execFileSync(process.execPath, [path.join(repoRoot, script)], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: home,
      STANDUP_DATA_DIR: '',
      STANDUP_DB_PATH: '',
    },
    input,
    encoding: 'utf8',
  });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('configure hook writes collected port into component config', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'zylos-standup-configure-'));
  try {
    runHook('hooks/configure.js', {
      home,
      input: JSON.stringify({ STANDUP_PORT: '3555' }),
    });
    const config = readJson(path.join(home, 'zylos/components/standup/config.json'));
    assert.equal(config.enabled, true);
    assert.equal(config.port, 3555);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('post-install creates config, logs, database, default team, and admin user', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'zylos-standup-post-install-'));
  try {
    const output = runHook('hooks/post-install.js', { home });
    const dataDir = path.join(home, 'zylos/components/standup');
    assert.match(output, /created initial admin user/);
    assert.ok(fs.existsSync(path.join(dataDir, 'logs')));

    const config = readJson(path.join(dataDir, 'config.json'));
    assert.equal(config.schemaVersion, 1);
    assert.equal(config.port, 3475);
    assert.equal(config.auth.enabled, true);

    const db = new Database(path.join(dataDir, 'standup.db'));
    try {
      const team = db.prepare('SELECT * FROM teams WHERE name = ?').get('Default');
      assert.ok(team);
      const admin = db.prepare('SELECT * FROM members WHERE username = ?').get('admin');
      assert.equal(admin.team_id, team.id);
      assert.equal(admin.role, 'admin');
      assert.match(admin.password_hash, /^scrypt:/);
      assert.ok(admin.password_salt);
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('upgrade hooks back up config and migrate missing defaults', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'zylos-standup-upgrade-'));
  try {
    const dataDir = path.join(home, 'zylos/components/standup');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify({ enabled: false }, null, 2));

    runHook('hooks/pre-upgrade.js', { home });
    const backups = fs.readdirSync(path.join(dataDir, 'backups'));
    assert.equal(backups.length, 1);
    assert.match(backups[0], /^config\..+\.json$/);

    runHook('hooks/post-upgrade.js', { home });
    const config = readJson(path.join(dataDir, 'config.json'));
    assert.equal(config.enabled, false);
    assert.equal(config.schemaVersion, 1);
    assert.equal(config.port, 3475);
    assert.equal(config.reports.defaultTimezone, 'Asia/Singapore');
    assert.equal(config.auth.sessionTtlHours, 12);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
