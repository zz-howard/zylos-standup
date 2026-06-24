import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { spawnSandboxed } from './sandbox.js';

function flattenConversation(prompt, conversation) {
  if (!conversation) return prompt;
  const parts = [conversation.systemPrompt, ''];
  for (const message of conversation.messages || []) {
    parts.push(`${message.role.toUpperCase()}: ${message.content}`);
  }
  return parts.join('\n').trim();
}

function buildSandbox(scenario) {
  return {
    scenario,
    runtime: 'claude',
    authStatePaths: [`${homedir()}/.claude`],
    readOnlyPaths: [],
  };
}

export default {
  name: 'claude',
  capabilities: ['text'],
  models: ['opus', 'sonnet', 'haiku'],
  defaultModel: 'sonnet',
  efforts: ['low', 'medium', 'high', 'max'],

  isAvailable() {
    try {
      execFileSync('which', ['claude'], { encoding: 'utf8', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  },

  async call(prompt, { model, effort, conversation, scenario }) {
    const fullPrompt = flattenConversation(prompt, conversation);
    const args = [
      '-p',
      fullPrompt,
      '--output-format',
      'json',
      '--model',
      model,
      '--effort',
      effort,
      '--tools',
      '',
    ];
    const env = { ...process.env, NO_COLOR: '1' };
    delete env.ANTHROPIC_API_KEY;

    const stdout = await new Promise((resolve, reject) => {
      const child = spawnSandboxed('claude', args, {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      }, buildSandbox(scenario));
      let out = '';
      let err = '';
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error('claude call timed out after 600s'));
      }, 600_000);
      child.stdout.on('data', (chunk) => { out += chunk.toString('utf8'); });
      child.stderr.on('data', (chunk) => { err += chunk.toString('utf8'); });
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new Error(`claude exited with code ${code}: ${err.slice(0, 500)}`));
          return;
        }
        resolve(out);
      });
    });

    try {
      const parsed = JSON.parse(stdout);
      return { text: parsed.result || '', sandboxed: true };
    } catch {
      return { text: stdout, sandboxed: true };
    }
  },
};
