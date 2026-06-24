import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zylos-standup-test-'));
process.env.STANDUP_DATA_DIR = tempDir;
fs.writeFileSync(path.join(tempDir, 'config.json'), JSON.stringify({ enabled: true }, null, 2));

const db = await import('../src/lib/db.js');
const scheduler = await import('../src/lib/scheduler.js');

test.after(() => {
  db.closeDb();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('initializes schema and records migration', () => {
  const tables = db.getDb().prepare(`
    SELECT name FROM sqlite_master WHERE type='table' ORDER BY name
  `).all().map(row => row.name);

  for (const table of [
    'teams',
    'members',
    'report_tasks',
    'report_conversations',
    'daily_schedules',
    'summaries',
    'sessions',
    'schema_migrations',
  ]) {
    assert.ok(tables.includes(table), `${table} should exist`);
  }

  const taskColumns = db.getDb().prepare('PRAGMA table_info(report_tasks)').all().map(c => c.name);
  assert.ok(taskColumns.includes('yesterday_text'));
  assert.ok(taskColumns.includes('today_text'));
  assert.ok(taskColumns.includes('ai_summary'));

  assert.equal(db.getDb().pragma('user_version', { simple: true }), 3);
});

test('creates teams, members, report tasks, conversations, and summaries', () => {
  const team = db.createTeam({ name: 'Engineering', timezone: 'Asia/Singapore' });
  const member = db.createMember({
    teamId: team.id,
    username: 'alice',
    displayName: 'Alice',
    passwordHash: 'hash',
    passwordSalt: 'salt',
    role: 'admin',
  });

  assert.equal(db.getMemberByUsername('alice').id, member.id);

  const task = db.createReportTask({
    teamId: team.id,
    memberId: member.id,
    reportDate: '2026-06-24',
    yesterdayText: 'Reviewed the plan.',
    todayText: 'Implement DB layer.',
    prompt: ['done', 'next', 'blockers'],
  });
  assert.equal(task.status, 'pending');
  assert.equal(task.yesterday_text, 'Reviewed the plan.');
  assert.equal(task.today_text, 'Implement DB layer.');
  assert.deepEqual(task.prompt, ['done', 'next', 'blockers']);

  const patched = db.updateReportTask(task.id, {
    yesterdayText: 'Finished schema.',
    todayText: 'Wire API next.',
    aiSummary: 'Implemented the core DB layer.',
  });
  assert.equal(patched.yesterday_text, 'Finished schema.');
  assert.equal(patched.today_text, 'Wire API next.');
  assert.equal(patched.ai_summary, 'Implemented the core DB layer.');

  const duplicate = db.createReportTask({
    teamId: team.id,
    memberId: member.id,
    reportDate: '2026-06-24',
  });
  assert.equal(duplicate.id, task.id);

  const started = db.updateReportTaskStatus(task.id, 'in_progress');
  assert.equal(started.status, 'in_progress');
  assert.ok(started.started_at);
  assert.throws(
    () => db.updateReportTaskStatus(task.id, 'pending'),
    /invalid report task status transition/
  );

  const message = db.addReportConversation({
    taskId: task.id,
    role: 'user',
    content: 'Shipped the DB layer.',
    meta: { source: 'test' },
  });
  assert.deepEqual(message.meta, { source: 'test' });
  assert.equal(db.listReportConversations(task.id).length, 1);

  const summary = db.upsertSummary({
    teamId: team.id,
    summaryDate: '2026-06-24',
    status: 'ready',
    content: 'Alice shipped the DB layer.',
    meta: { taskIds: [task.id] },
  });
  assert.equal(summary.status, 'ready');
  assert.ok(summary.generated_at);
  assert.deepEqual(summary.meta, { taskIds: [task.id] });
});

test('applies daily schedule overrides and batch creates workday tasks', () => {
  const team = db.createTeam({ name: 'Product' });
  const member = db.createMember({
    teamId: team.id,
    username: 'bob',
    displayName: 'Bob',
  });

  assert.equal(scheduler.isWorkday('2026-06-27'), false);
  db.upsertDailySchedule({ date: '2026-06-27', isWorkday: true, reason: 'make-up day' });
  assert.equal(scheduler.isWorkday('2026-06-27'), true);

  const result = scheduler.createDailyReportTasks('2026-06-27', { teamId: team.id });
  assert.equal(result.skipped, false);
  assert.equal(result.created, 1);
  assert.equal(result.tasks[0].member_id, member.id);
  const duplicate = scheduler.createDailyReportTasks('2026-06-27', { teamId: team.id });
  assert.equal(duplicate.created, 0);
  assert.equal(duplicate.tasks.length, 1);

  db.upsertDailySchedule({ date: '2026-06-29', isWorkday: false, reason: 'holiday' });
  const skipped = scheduler.createDailyReportTasks('2026-06-29', { teamId: team.id });
  assert.equal(skipped.skipped, true);
  assert.equal(skipped.created, 0);
});
