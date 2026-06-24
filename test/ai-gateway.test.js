import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zylos-standup-gateway-'));
process.env.STANDUP_DATA_DIR = tempDir;
fs.writeFileSync(path.join(tempDir, 'config.json'), JSON.stringify({
  ai: {
    default: { runtime: 'auto', model: 'auto', effort: 'medium' },
  },
}, null, 2));

const gateway = await import('../src/ai/ai-gateway.js');

test.after(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function adapter(name, available) {
  return {
    name,
    capabilities: ['text'],
    defaultModel: `${name}-default`,
    isAvailable: () => available,
    call: async () => ({ text: `${name} reply`, sandboxed: name === 'claude' }),
  };
}

test('resolve auto selects claude when claude is available', () => {
  const resolved = gateway.resolve('report', {
    adapterRegistry: {
      claude: adapter('claude', true),
      'codex-api': adapter('codex-api', true),
    },
  });

  assert.equal(resolved.runtimeName, 'claude');
  assert.equal(resolved.model, 'claude-default');
});

test('resolve auto falls back to codex-api when claude is unavailable', () => {
  const resolved = gateway.resolve('report', {
    adapterRegistry: {
      claude: adapter('claude', false),
      'codex-api': adapter('codex-api', true),
    },
  });

  assert.equal(resolved.runtimeName, 'codex-api');
  assert.equal(resolved.model, 'codex-api-default');
});

test('resolve auto returns actionable error when no runtime is available', () => {
  assert.throws(() => gateway.resolve('report', {
    adapterRegistry: {
      claude: adapter('claude', false),
      'codex-api': adapter('codex-api', false),
    },
  }), /install\/authenticate Claude CLI or Codex API/);
});

test('call returns runtime, model, and sandbox metadata', async () => {
  const result = await gateway.call('report', 'hello', {
    conversation: {
      systemPrompt: 'system',
      messages: [{ role: 'user', content: 'hello' }],
    },
    adapterRegistry: {
      claude: adapter('claude', true),
      'codex-api': adapter('codex-api', false),
    },
  });

  assert.deepEqual(result, {
    text: 'claude reply',
    runtime: 'claude',
    model: 'claude-default',
    sandboxed: true,
  });
});

test('detectRuntimes reports available runtimes', () => {
  assert.deepEqual(gateway.detectRuntimes({
    adapterRegistry: {
      claude: adapter('claude', false),
      'codex-api': adapter('codex-api', true),
    },
  }), { available: ['codex-api'], selected: 'codex-api' });
});

test('auto mode falls back to codex-api when claude call fails (sandbox init failure)', async () => {
  const failingClaude = {
    name: 'claude',
    capabilities: ['text'],
    defaultModel: 'sonnet',
    isAvailable: () => true,
    call: async () => { throw new Error('bwrap: setting up uid map: Permission denied'); },
  };
  const result = await gateway.call('report', 'hello', {
    conversation: { systemPrompt: 'test', messages: [{ role: 'user', content: 'hello' }] },
    adapterRegistry: {
      claude: failingClaude,
      'codex-api': adapter('codex-api', true),
    },
  });
  assert.equal(result.runtime, 'codex-api');
  assert.equal(result.text, 'codex-api reply');
});

test('explicit runtime does not fallback on failure', async () => {
  const failingClaude = {
    name: 'claude',
    capabilities: ['text'],
    defaultModel: 'sonnet',
    isAvailable: () => true,
    call: async () => { throw new Error('sandbox init failed'); },
  };
  await assert.rejects(
    () => gateway.call('report', 'hello', {
      overrides: { runtime: 'claude', model: 'auto', effort: 'medium' },
      adapterRegistry: {
        claude: failingClaude,
        'codex-api': adapter('codex-api', true),
      },
    }),
    /sandbox init failed/,
  );
});
