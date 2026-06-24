import { getConfig } from '../lib/config.js';
import claudeAdapter from './runtimes/claude.js';
import codexApiAdapter from './runtimes/codex-api.js';

const DEFAULT_MODELS = {
  claude: 'sonnet',
  'codex-api': 'gpt-5.4',
};

const adapters = {
  [claudeAdapter.name]: claudeAdapter,
  [codexApiAdapter.name]: codexApiAdapter,
};

function deepMerge(target, source) {
  const result = { ...(target || {}) };
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
    } else {
      result[key] = value;
    }
  }
  return result;
}

function resolveScenarioConfig(scenario) {
  const ai = getConfig().ai || {};
  return deepMerge(ai.default || {}, ai[scenario] || {});
}

function resolveAutoRuntime(adapterRegistry = adapters) {
  if (adapterRegistry.claude?.isAvailable()) return 'claude';
  if (adapterRegistry['codex-api']?.isAvailable()) return 'codex-api';
  throw new Error('No AI runtime available; install/authenticate Claude CLI or Codex API');
}

export function detectRuntimes({ adapterRegistry = adapters } = {}) {
  const available = [];
  for (const [name, adapter] of Object.entries(adapterRegistry)) {
    if (adapter.isAvailable()) available.push(name);
  }
  let selected = null;
  try { selected = resolveAutoRuntime(adapterRegistry); } catch { /* none available */ }
  return { available, selected };
}

export function getAdapter(name) {
  return adapters[name] || null;
}

export function resolve(scenario = 'report', { overrides, adapterRegistry = adapters } = {}) {
  const cfg = overrides || resolveScenarioConfig(scenario);
  const requestedRuntime = cfg.runtime || cfg.provider || 'auto';
  const runtimeName = requestedRuntime === 'auto'
    ? resolveAutoRuntime(adapterRegistry)
    : requestedRuntime;
  const adapter = adapterRegistry[runtimeName];
  if (!adapter) throw new Error(`AI runtime "${runtimeName}" is not registered`);
  if (!adapter.isAvailable()) throw new Error(`AI runtime "${runtimeName}" is not available`);

  return {
    adapter,
    runtimeName,
    model: cfg.model && cfg.model !== 'auto'
      ? cfg.model
      : adapter.defaultModel || DEFAULT_MODELS[runtimeName],
    effort: cfg.effort || 'medium',
  };
}

function checkCapability(adapter, required = []) {
  for (const capability of required) {
    if (!adapter.capabilities.includes(capability)) {
      throw new Error(`AI runtime "${adapter.name}" does not support "${capability}"`);
    }
  }
}

export async function call(scenario, prompt, {
  conversation,
  required = ['text'],
  overrides,
  adapterRegistry = adapters,
} = {}) {
  const cfg = overrides || resolveScenarioConfig(scenario);
  const isAutoMode = (cfg.runtime || cfg.provider || 'auto') === 'auto';
  const { adapter, runtimeName, model, effort } = resolve(scenario, { overrides, adapterRegistry });
  checkCapability(adapter, required);

  try {
    const result = await adapter.call(prompt, {
      model,
      effort,
      conversation,
      scenario,
      capabilities: required,
    });
    return {
      text: String(result?.text || result || '').trim(),
      runtime: runtimeName,
      model,
      sandboxed: Boolean(result?.sandboxed),
    };
  } catch (err) {
    if (!isAutoMode) throw err;
    const fallbacks = Object.entries(adapterRegistry)
      .filter(([name, a]) => name !== runtimeName && a.isAvailable() && required.every(c => a.capabilities.includes(c)));
    if (fallbacks.length === 0) throw err;
    const [fallbackName, fallbackAdapter] = fallbacks[0];
    const fallbackModel = cfg.model && cfg.model !== 'auto' ? cfg.model : fallbackAdapter.defaultModel || DEFAULT_MODELS[fallbackName];
    console.log(`[standup] AI runtime "${runtimeName}" failed (${err.message}), falling back to "${fallbackName}"`);
    const result = await fallbackAdapter.call(prompt, {
      model: fallbackModel,
      effort,
      conversation,
      scenario,
      capabilities: required,
    });
    return {
      text: String(result?.text || result || '').trim(),
      runtime: fallbackName,
      model: fallbackModel,
      sandboxed: Boolean(result?.sandboxed),
    };
  }
}
