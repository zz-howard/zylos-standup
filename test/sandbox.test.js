import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { homedir } from 'node:os';

const HOME = homedir();
const ZYLOS_DIR = path.join(HOME, 'zylos');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zylos-standup-sandbox-test-'));
process.env.STANDUP_DATA_DIR = tempDir;
fs.writeFileSync(path.join(tempDir, 'config.json'), JSON.stringify({ enabled: true }, null, 2));

const {
  buildSandboxRuntimeConfig,
  quoteSandboxCommand,
  spawnSandboxed,
} = await import('../src/ai/runtimes/sandbox.js');

test.after(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('standup sandbox denies home and zylos by default', () => {
  const cfg = buildSandboxRuntimeConfig('node', {}, {
    scenario: 'report',
    runtime: 'claude',
    authStatePaths: [],
    readOnlyPaths: [],
  });

  assert.deepEqual(cfg.filesystem.denyRead, [HOME, ZYLOS_DIR]);
});

test('standup sandbox does not allow component data, config, or db by default', () => {
  const standupDir = path.join(HOME, 'zylos/components/standup');
  const cfg = buildSandboxRuntimeConfig('node', {}, {
    scenario: 'summary',
    runtime: 'claude',
    authStatePaths: [],
    readOnlyPaths: [],
    supportReadPaths: [ZYLOS_DIR, standupDir],
  });

  const zylosAllowReads = cfg.filesystem.allowRead.filter(
    (entry) => entry === ZYLOS_DIR || entry.startsWith(ZYLOS_DIR + path.sep),
  );
  const nonVendorZylosAllowReads = zylosAllowReads.filter(
    (entry) => !entry.includes('sandbox-runtime/vendor'),
  );

  assert.deepEqual(nonVendorZylosAllowReads, []);
  assert.equal(cfg.filesystem.allowRead.includes(standupDir), false);
  assert.equal(cfg.filesystem.allowRead.includes(path.join(standupDir, 'config.json')), false);
  assert.equal(cfg.filesystem.allowRead.includes(path.join(standupDir, 'standup.db')), false);
});

test('standup sandbox allows auth, support, and temp paths only when needed', () => {
  const authDir = fs.mkdtempSync(path.join(os.tmpdir(), 'standup-auth-'));
  const supportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'standup-support-'));
  const tempWrite = fs.mkdtempSync(path.join(os.tmpdir(), 'standup-write-'));
  const cfg = buildSandboxRuntimeConfig('node', {}, {
    scenario: 'report',
    runtime: 'claude',
    authStatePaths: [authDir],
    supportReadPaths: [supportDir],
    writePaths: [tempWrite],
  });

  assert.equal(cfg.filesystem.allowRead.includes(authDir), true);
  assert.equal(cfg.filesystem.allowRead.includes(supportDir), true);
  assert.equal(cfg.filesystem.allowWrite.includes(authDir), true);
  assert.equal(cfg.filesystem.allowWrite.includes(tempWrite), true);
  fs.rmSync(authDir, { recursive: true, force: true });
  fs.rmSync(supportDir, { recursive: true, force: true });
  fs.rmSync(tempWrite, { recursive: true, force: true });
});

test('sandbox runner fails closed when initialization fails and allowUnsandboxed is false', async () => {
  const child = spawnSandboxed(process.execPath, ['-e', 'console.log("should not run")'], {
    env: {
      ...process.env,
      STANDUP_SANDBOX_FORCE_INIT_FAILURE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  }, {
    scenario: 'report',
    runtime: 'claude',
    authStatePaths: [],
  });

  const result = await new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });

  assert.equal(result.code, 126);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /sandbox initialization failed closed/);
});

test('quoted sandbox command preserves argv boundaries', () => {
  const expected = [
    'space value',
    'quote " value',
    "single ' quote",
    'line\nbreak',
    'dollar $HOME',
    'semi;colon',
  ];
  const quoted = quoteSandboxCommand('node', [
    '-e',
    'console.log(JSON.stringify(process.argv.slice(1)))',
    ...expected,
  ]);

  const output = execFileSync('/bin/sh', ['-c', quoted], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(output), expected);
});
