import { callAi } from './client.js';

const SUMMARY_RE = /\[SUMMARY_START\]([\s\S]*?)\[SUMMARY_END\]/i;

export const SYSTEM_PROMPTS = {
  personal_daily: `You are a standup assistant helping one team member prepare a concise daily update.
Ask focused follow-up questions when needed. Keep replies practical and brief.
Maintain an evolving summary between [SUMMARY_START] and [SUMMARY_END].`,
  project_progress: `You are a standup assistant helping a team understand project progress.
Focus on completed work, next actions, blockers, owners, and risks.
Maintain an evolving summary between [SUMMARY_START] and [SUMMARY_END].`,
};

export function extractSummary(text) {
  const match = String(text || '').match(SUMMARY_RE);
  if (!match) return { replyText: text || '', summary: null };
  return {
    replyText: String(text || '').replace(SUMMARY_RE, '').trim(),
    summary: match[1].trim(),
  };
}

export function buildConversationContext({ task, history = [], userMessage, type = 'personal_daily' }) {
  const systemPrompt = [
    SYSTEM_PROMPTS[type] || SYSTEM_PROMPTS.personal_daily,
    '',
    'Task context:',
    `- Report date: ${task.report_date}`,
    `- Current status: ${task.status}`,
    `- Yesterday text: ${task.yesterday_text || '(empty)'}`,
    `- Today text: ${task.today_text || '(empty)'}`,
    `- Current AI summary: ${task.ai_summary || '(empty)'}`,
    `- Prompt questions: ${Array.isArray(task.prompt) ? task.prompt.join(' | ') : '(default standup)'}`,
    '',
    'When you include an updated summary, use exactly:',
    '[SUMMARY_START]',
    'summary text',
    '[SUMMARY_END]',
  ].join('\n');

  const messages = history
    .filter(row => row.role === 'user' || row.role === 'assistant')
    .map(row => ({ role: row.role, content: row.content }));
  messages.push({ role: 'user', content: userMessage });
  return { systemPrompt, messages };
}

export async function generateConversationReply({
  task,
  history,
  userMessage,
  type = 'personal_daily',
  aiClient = callAi,
}) {
  const conversation = buildConversationContext({ task, history, userMessage, type });
  const result = await aiClient({ ...conversation, scenario: 'report' });
  const { replyText, summary } = extractSummary(result.text);
  return {
    replyText: replyText || result.text || '',
    summary,
    meta: {
      provider: result.provider || 'test',
      model: result.model || null,
    },
  };
}
