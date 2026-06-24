import { call as gatewayCall } from './ai-gateway.js';

export function buildBriefPrompt({ team, summaryDate, tasks }) {
  const lines = tasks.map(task => [
    `Member: ${task.display_name}`,
    `Yesterday: ${task.yesterday_text || '(empty)'}`,
    `Today: ${task.today_text || '(empty)'}`,
    `AI summary: ${task.ai_summary || '(empty)'}`,
  ].join('\n')).join('\n\n');

  return {
    systemPrompt: [
      'You are a standup summary editor.',
      'Create a 400-600 word digest with these sections:',
      '1. Overall status',
      '2. Key progress',
      '3. Attention items',
      '4. Tomorrow focus',
      'Consolidate related work across members and avoid repeating raw inputs.',
    ].join('\n'),
    messages: [{
      role: 'user',
      content: [
        `Team: ${team.name}`,
        `Date: ${summaryDate}`,
        '',
        lines || '(No completed reports.)',
      ].join('\n'),
    }],
  };
}

function flattenConversation(conversation) {
  return [
    conversation.systemPrompt,
    '',
    ...conversation.messages.map(message => `${message.role.toUpperCase()}: ${message.content}`),
  ].join('\n');
}

export async function callSummaryGateway(request) {
  return gatewayCall(request.scenario || 'summary', flattenConversation(request), {
    conversation: {
      systemPrompt: request.systemPrompt,
      messages: request.messages,
    },
  });
}

export async function generateBriefSummary({ team, summaryDate, tasks, aiClient = callSummaryGateway }) {
  if (!tasks.length) {
    return 'No completed reports were available for this date.';
  }
  const context = buildBriefPrompt({ team, summaryDate, tasks });
  const result = await aiClient({ ...context, scenario: 'summary' });
  return String(result.text || '').trim();
}
