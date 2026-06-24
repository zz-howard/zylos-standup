/**
 * Workday and task scheduling helpers for zylos-standup.
 */

import { getConfig } from './config.js';
import {
  createReportTask,
  getDailySchedule,
  getDb,
  getReportTaskForMemberDate,
  listMembers,
} from './db.js';

export function normalizeDate(date = new Date()) {
  if (typeof date === 'string') return date.slice(0, 10);
  return date.toISOString().slice(0, 10);
}

export function isDefaultWorkday(date = new Date()) {
  const normalized = normalizeDate(date);
  const day = new Date(`${normalized}T00:00:00Z`).getUTCDay();
  return day >= 1 && day <= 5;
}

export function isWorkday(date = new Date()) {
  const normalized = normalizeDate(date);
  const override = getDailySchedule(normalized);
  if (override) return override.is_workday === 1;
  return isDefaultWorkday(normalized);
}

export function createDailyReportTasks(date = new Date(), { teamId } = {}) {
  const reportDate = normalizeDate(date);
  if (!isWorkday(reportDate)) {
    return { reportDate, created: 0, skipped: true, tasks: [] };
  }

  const config = getConfig();
  const members = listMembers({ teamId, active: true });
  const tasks = [];
  let created = 0;
  const tx = getDb().transaction(() => {
    for (const member of members) {
      const existing = getReportTaskForMemberDate(member.id, reportDate);
      if (!existing) created += 1;
      tasks.push(createReportTask({
        teamId: member.team_id,
        memberId: member.id,
        reportDate,
        prompt: config.reports?.defaultPrompt || null,
      }));
    }
  });
  tx.immediate();

  return { reportDate, created, skipped: false, tasks };
}
