import { getConfig } from '../lib/config.js';

const DEFAULT_MODELS = {
  openai: 'gpt-4.1-mini',
  anthropic: 'claude-3-5-sonnet-latest',
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

export function resolveAiConfig(scenario = 'report') {
  const ai = getConfig().ai || {};
  const scenarioConfig = deepMerge(ai.default || {}, ai[scenario] || {});
  let provider = scenarioConfig.provider || scenarioConfig.runtime || 'auto';
  if (provider === 'auto') {
    if (process.env.OPENAI_API_KEY) provider = 'openai';
    else if (process.env.ANTHROPIC_API_KEY) provider = 'anthropic';
  }
  if (!['openai', 'anthropic'].includes(provider)) {
    throw new Error('AI provider not configured; set ai.default.provider to openai or anthropic');
  }
  return {
    provider,
    model: scenarioConfig.model && scenarioConfig.model !== 'auto'
      ? scenarioConfig.model
      : DEFAULT_MODELS[provider],
    maxTokens: scenarioConfig.maxTokens || 800,
    temperature: scenarioConfig.temperature ?? 0.2,
  };
}

export async function callAi({ systemPrompt, messages, scenario = 'report' }) {
  const aiConfig = resolveAiConfig(scenario);
  if (aiConfig.provider === 'openai') {
    return callOpenAi({ ...aiConfig, systemPrompt, messages });
  }
  return callAnthropic({ ...aiConfig, systemPrompt, messages });
}

async function callOpenAi({ model, temperature, systemPrompt, messages }) {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model,
    temperature,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.map(({ role, content }) => ({ role, content })),
    ],
  });
  return {
    text: response.choices?.[0]?.message?.content || '',
    provider: 'openai',
    model,
  };
}

async function callAnthropic({ model, maxTokens, temperature, systemPrompt, messages }) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages: messages.map(({ role, content }) => ({
      role: role === 'assistant' ? 'assistant' : 'user',
      content,
    })),
  });
  return {
    text: response.content?.map(block => block.type === 'text' ? block.text : '').join('').trim() || '',
    provider: 'anthropic',
    model,
  };
}
