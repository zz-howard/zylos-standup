import fs from 'node:fs';
import path from 'node:path';
import { getConfig } from './config.js';
import { getDb, getSummary, getTeam, upsertSummary } from './db.js';
import { generateBriefSummary } from '../ai/summary.js';

function slugify(value) {
  return String(value || 'team')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'team';
}

function escapeMarkdown(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim();
}

export function listCompletedTasksForSummary({ teamId, summaryDate }) {
  return getDb().prepare(`
    SELECT rt.*, m.display_name, m.username
    FROM report_tasks rt
    JOIN members m ON m.id = rt.member_id
    WHERE rt.team_id = ?
      AND rt.report_date = ?
      AND rt.status = 'completed'
    ORDER BY m.display_name ASC, rt.id ASC
  `).all(teamId, summaryDate);
}

export function renderDetailedMarkdown({ team, summaryDate, tasks, briefText }) {
  const sections = tasks.map(task => [
    `## ${task.display_name}`,
    '',
    '### Update',
    '',
    `- **Yesterday:** ${escapeMarkdown(task.yesterday_text) || '(empty)'}`,
    `- **Today:** ${escapeMarkdown(task.today_text) || '(empty)'}`,
    '',
    '### AI Summary',
    '',
    escapeMarkdown(task.ai_summary) || '(empty)',
  ].join('\n'));

  return [
    '---',
    `title: ${team.name} Standup ${summaryDate}`,
    `date: ${summaryDate}`,
    '---',
    '',
    `# ${team.name} Standup - ${summaryDate}`,
    '',
    '## Brief',
    '',
    escapeMarkdown(briefText) || '(empty)',
    '',
    ...sections,
    '',
  ].join('\n');
}

export function writeDetailedSummary({ team, summaryDate, markdown }) {
  const pagesDir = getConfig().reports?.pagesDir;
  const dir = path.join(pagesDir, slugify(team.name));
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${summaryDate}.md`);
  fs.writeFileSync(filePath, markdown);
  return filePath;
}

export async function generateDailySummary({ teamId, summaryDate, aiClient } = {}) {
  const team = getTeam(teamId);
  if (!team) throw new Error('team_not_found');
  const tasks = listCompletedTasksForSummary({ teamId, summaryDate });
  try {
    const briefText = await generateBriefSummary({ team, summaryDate, tasks, aiClient });
    const markdown = renderDetailedMarkdown({ team, summaryDate, tasks, briefText });
    const fullHtmlPath = writeDetailedSummary({ team, summaryDate, markdown });
    return upsertSummary({
      teamId,
      summaryDate,
      status: 'ready',
      content: markdown,
      briefText,
      fullHtmlPath,
      meta: {
        taskIds: tasks.map(task => task.id),
        completedCount: tasks.length,
      },
    });
  } catch (err) {
    return upsertSummary({
      teamId,
      summaryDate,
      status: 'failed',
      content: null,
      briefText: null,
      fullHtmlPath: null,
      meta: { taskIds: tasks.map(task => task.id), completedCount: tasks.length },
      errorMessage: err.message,
    });
  }
}

export function getDailySummary({ teamId, summaryDate }) {
  return getSummary(teamId, summaryDate);
}
