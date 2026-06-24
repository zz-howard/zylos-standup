import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os, { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import shellquote from 'shell-quote';
import { getConfig } from '../../lib/config.js';

const HOME = homedir();
const ZYLOS_DIR = path.join(HOME, 'zylos');
const RUNNER_PATH = fileURLToPath(new URL('./sandbox-runner.js', import.meta.url));
const PAYLOAD_DIR = path.join(tmpdir(), 'zylos-standup-sandbox');
const SANDBOX_CWD = path.join(tmpdir(), 'zylos-standup-sandbox-cwd');

const DEFAULT_DENIED_DOMAINS = [
  'metadata.google.internal',
  '169.254.169.254',
  '127.0.0.1',
  'localhost',
];

const RUNTIME_SUPPORT_PATHS = [
  path.join(HOME, '.nvm'),
  path.join(HOME, '.local/bin'),
  path.join(HOME, '.local/share/claude'),
  path.join(HOME, '.local/share/pnpm'),
  path.join(HOME, '.npm'),
  '/opt/homebrew/bin',
  '/opt/homebrew/lib/node_modules',
  '/usr/local/bin',
  '/usr/local/lib/node_modules',
];

function srtVendorPaths() {
  try {
    const srtEntry = fileURLToPath(import.meta.resolve('@anthropic-ai/sandbox-runtime'));
    const vendorDir = path.resolve(path.dirname(srtEntry), '..', 'vendor');
    return fs.existsSync(vendorDir) ? [vendorDir] : [];
  } catch {
    return [];
  }
}

function existingPaths(paths) {
  return [...new Set((paths || []).filter(Boolean).map((value) => path.resolve(value)))]
    .filter((value) => fs.existsSync(value));
}

export function quoteSandboxCommand(cmd, args = []) {
  return shellquote.quote([cmd, ...args]);
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function aiConfig() {
  return getConfig().ai || {};
}

function sandboxConfig() {
  return aiConfig().sandbox || {};
}

function listFromConfig(...values) {
  return values.flatMap((value) => (Array.isArray(value) ? value : []));
}

export function networkConfigForSandbox(sandbox = {}, config = aiConfig()) {
  const scenarioSandbox = (sandbox.scenario && config[sandbox.scenario]?.sandbox) || {};
  const selectedNetwork = hasOwn(sandbox, 'network')
    ? (sandbox.network || {})
    : hasOwn(scenarioSandbox, 'network')
      ? (scenarioSandbox.network || {})
      : (config.sandbox?.network || {});
  const allowedDomains = listFromConfig(selectedNetwork.allowedDomains);
  if (allowedDomains.length === 0) return {};
  return {
    allowedDomains,
    deniedDomains: [
      ...DEFAULT_DENIED_DOMAINS,
      ...(selectedNetwork.deniedDomains || []),
    ],
    ...(selectedNetwork.allowUnixSockets ? { allowUnixSockets: selectedNetwork.allowUnixSockets } : {}),
    ...(selectedNetwork.allowAllUnixSockets ? { allowAllUnixSockets: true } : {}),
    ...(selectedNetwork.allowLocalBinding ? { allowLocalBinding: true } : {}),
    ...(selectedNetwork.allowMachLookup ? { allowMachLookup: selectedNetwork.allowMachLookup } : {}),
    ...(selectedNetwork.parentProxy ? { parentProxy: selectedNetwork.parentProxy } : {}),
  };
}

function resolveCommandPath(cmd, env) {
  if (!cmd || cmd.includes('/')) return cmd;
  try {
    return execFileSync('which', [cmd], {
      encoding: 'utf8',
      timeout: 3000,
      env: env || process.env,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function commandSupportPaths(cmd, env) {
  const resolved = resolveCommandPath(cmd, env);
  if (!resolved) return [];
  const paths = [path.dirname(resolved)];
  if (resolved.startsWith(HOME + path.sep)) {
    const segments = resolved.slice(HOME.length + 1).split(path.sep);
    if (segments[0]) paths.push(path.join(HOME, segments[0]));
    if (segments[0] === '.nvm') paths.push(path.join(HOME, '.nvm'));
    if (segments[0] === '.local') paths.push(path.join(HOME, '.local'));
  }
  return paths;
}

function runtimeAuthStatePaths(runtime, extra = []) {
  const defaults = {
    claude: [path.join(HOME, '.claude')],
    'codex-api': [path.join(HOME, '.codex')],
  };
  return existingPaths([...extra, ...(defaults[runtime] || [])]);
}

function runtimeReadOnlyConfigPaths(runtime) {
  const defaults = {
    claude: [path.join(HOME, '.claude.json')],
  };
  return existingPaths(defaults[runtime] || []);
}

export function buildSandboxRuntimeConfig(cmd, opts = {}, sandbox = {}) {
  const runtime = sandbox.runtime || 'unknown';
  const authStatePaths = existingPaths([
    ...runtimeAuthStatePaths(runtime, sandbox.rwBinds || []),
    ...(sandbox.authStatePaths || []),
  ]);
  const supportPaths = existingPaths([
    ...RUNTIME_SUPPORT_PATHS,
    ...commandSupportPaths(cmd, opts.env),
    ...(sandbox.supportReadPaths || []),
  ]).filter((value) => value !== ZYLOS_DIR && !value.startsWith(ZYLOS_DIR + path.sep));
  const readOnlyPaths = existingPaths([
    ...(sandbox.roBinds || []),
    ...(sandbox.readOnlyPaths || []),
  ]);
  const tempWritePaths = existingPaths([
    tmpdir(),
    PAYLOAD_DIR,
    SANDBOX_CWD,
    ...(os.platform() === 'darwin' ? ['/tmp', '/private/tmp'] : []),
    ...(sandbox.writePaths || []),
  ]);

  return {
    network: networkConfigForSandbox(sandbox),
    filesystem: {
      denyRead: [HOME, ZYLOS_DIR],
      allowRead: [
        ...supportPaths,
        ...srtVendorPaths(),
        ...authStatePaths,
        ...runtimeReadOnlyConfigPaths(runtime),
        ...readOnlyPaths,
      ],
      allowWrite: [
        ...authStatePaths,
        ...tempWritePaths,
      ],
      denyWrite: [],
      allowGitConfig: false,
    },
    enableWeakerNestedSandbox: false,
    enableWeakerNetworkIsolation: false,
    ripgrep: { command: 'rg' },
    mandatoryDenySearchDepth: 3,
  };
}

function allowUnsandboxed(sandbox = {}) {
  return Boolean(sandbox.allowUnsandboxed || sandboxConfig().allowUnsandboxed);
}

function writePayload(cmd, args, opts, sandbox) {
  fs.mkdirSync(PAYLOAD_DIR, { recursive: true, mode: 0o700 });
  fs.mkdirSync(SANDBOX_CWD, { recursive: true, mode: 0o700 });
  const payloadPath = path.join(
    PAYLOAD_DIR,
    `sandbox-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
  const payload = {
    cmd,
    args,
    runtimeConfig: buildSandboxRuntimeConfig(cmd, opts, sandbox),
    metadata: {
      scenario: sandbox.scenario || 'unknown',
      runtime: sandbox.runtime || 'unknown',
      platform: os.platform(),
    },
    allowUnsandboxed: allowUnsandboxed(sandbox),
    shell: sandbox.shell || 'bash',
  };
  fs.writeFileSync(payloadPath, JSON.stringify(payload), { mode: 0o600 });
  return payloadPath;
}

export function spawnSandboxed(cmd, args = [], opts = {}, sandbox = {}) {
  const payloadPath = writePayload(cmd, args, opts, sandbox);
  return spawn(process.execPath, [RUNNER_PATH, payloadPath], {
    ...opts,
    cwd: sandbox.cwd || SANDBOX_CWD,
  });
}
