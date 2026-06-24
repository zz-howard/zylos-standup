import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import OpenAI from 'openai';
import { fetch as undiciFetch, ProxyAgent } from 'undici';

const execFileAsync = promisify(execFile);

const AUTH_PATH = path.join(process.env.HOME || '/root', '.codex/auth.json');
const BASE_URL = 'https://chatgpt.com/backend-api/codex';
const TOKEN_URL = 'https://auth.openai.com/oauth/token';
const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const REFRESH_LEEWAY_SEC = 60 * 60;

function decodeJwtPayload(jwt) {
  const parts = String(jwt || '').split('.');
  if (parts.length !== 3) throw new Error('invalid JWT');
  const pad = parts[1] + '='.repeat((4 - (parts[1].length % 4)) % 4);
  const normalized = pad.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'));
}

function readAuth() {
  return JSON.parse(fs.readFileSync(AUTH_PATH, 'utf8'));
}

function writeAuthAtomic(auth) {
  const tmpPath = `${AUTH_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(auth, null, 2), { mode: 0o600 });
  fs.renameSync(tmpPath, AUTH_PATH);
}

async function curlForm(url, form) {
  const encoded = Object.entries(form)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  const { stdout } = await execFileAsync('curl', [
    '-sS',
    '-m',
    '30',
    url,
    '-H',
    'Content-Type: application/x-www-form-urlencoded',
    '-H',
    'Accept: application/json',
    '-d',
    encoded,
  ], { encoding: 'utf8', timeout: 35_000, maxBuffer: 512 * 1024 });
  return stdout;
}

async function refreshTokenIfNeeded(auth) {
  const token = auth?.tokens?.access_token;
  if (!token) throw new Error('auth.json missing access_token');
  const payload = decodeJwtPayload(token);
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp - now > REFRESH_LEEWAY_SEC) return auth;

  const refreshToken = auth?.tokens?.refresh_token;
  if (!refreshToken) throw new Error('token expired and no refresh_token');

  const response = await curlForm(TOKEN_URL, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
    scope: 'openid profile email offline_access',
  });
  let data;
  try {
    data = JSON.parse(response);
  } catch {
    throw new Error(`refresh returned non-JSON: ${response.slice(0, 200)}`);
  }
  if (!data.access_token) throw new Error(`refresh failed: ${response.slice(0, 300)}`);

  const updated = {
    ...auth,
    tokens: {
      ...auth.tokens,
      access_token: data.access_token,
      id_token: data.id_token || auth.tokens.id_token,
      refresh_token: data.refresh_token || refreshToken,
    },
    last_refresh: new Date().toISOString(),
  };
  writeAuthAtomic(updated);
  return updated;
}

export function buildProxiedFetch() {
  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (!proxy) return undefined;
  const dispatcher = new ProxyAgent(proxy);
  return (url, init) => undiciFetch(url, { ...init, dispatcher });
}

async function createClient() {
  let auth = readAuth();
  auth = await refreshTokenIfNeeded(auth);
  const token = auth.tokens.access_token;
  const payload = decodeJwtPayload(token);
  const accountId = payload?.['https://api.openai.com/auth']?.chatgpt_account_id;
  if (!accountId) throw new Error('JWT missing chatgpt_account_id');

  const options = {
    apiKey: token,
    baseURL: BASE_URL,
    defaultHeaders: {
      'chatgpt-account-id': accountId,
      originator: 'codex_cli_rs',
    },
  };
  const proxiedFetch = buildProxiedFetch();
  if (proxiedFetch) options.fetch = proxiedFetch;
  return new OpenAI(options);
}

function buildInput(prompt, conversation) {
  if (!conversation) {
    return {
      instructions: 'You are a helpful assistant. Respond in plain text.',
      input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }],
    };
  }
  return {
    instructions: conversation.systemPrompt,
    input: conversation.messages.map((message) => (
      message.role === 'assistant'
        ? { role: 'assistant', content: [{ type: 'output_text', text: message.content }] }
        : { role: 'user', content: [{ type: 'input_text', text: message.content }] }
    )),
  };
}

async function consumeStream(stream) {
  let text = '';
  for await (const event of stream) {
    if (event.type === 'response.output_text.delta') text += event.delta || '';
    if (event.type === 'error') {
      throw new Error(`codex-api error: ${event.error?.message || JSON.stringify(event)}`);
    }
  }
  return text.trim();
}

export default {
  name: 'codex-api',
  capabilities: ['text'],
  models: ['gpt-5.5', 'gpt-5.4', 'gpt-5.3-codex'],
  defaultModel: 'gpt-5.4',
  efforts: ['none', 'low', 'medium', 'high', 'xhigh'],

  isAvailable() {
    try {
      const auth = readAuth();
      return Boolean(auth?.tokens?.access_token);
    } catch {
      return false;
    }
  },

  async call(prompt, { model, effort, conversation }) {
    const client = await createClient();
    const params = {
      model,
      stream: true,
      store: false,
      ...buildInput(prompt, conversation),
    };
    if (effort && effort !== 'medium') params.reasoning = { effort };

    const stream = await client.responses.create(params);
    const text = await consumeStream(stream);
    if (!text) throw new Error('codex-api returned empty response');
    return { text, sandboxed: false };
  },
};
