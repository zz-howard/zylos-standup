import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zylos-standup-tasks-api-'));
process.env.STANDUP_DATA_DIR = tempDir;
fs.writeFileSync(path.join(tempDir, 'config.json'), JSON.stringify({ enabled: true }, null, 2));

const db = await import('../src/lib/db.js');
const auth = await import('../src/lib/auth.js');
const tasksApi = await import('../src/lib/tasks-api.js');

function startApp({ aiClient } = {}) {
  const app = express();
  app.set('trust proxy', 'loopback');
  app.use(express.json());
  auth.setupAuthRoutes(app);
  tasksApi.setupTaskRoutes(app, { aiClient });
  return new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

async function login(baseUrl, { teamId, name, password }) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ team_id: teamId, name, password }),
  });
  assert.equal(res.status, 200);
  return res.headers.get('set-cookie').split(';')[0];
}

function createMemberWithPassword({ teamId, username, displayName, password, role = 'member' }) {
  const hashed = auth.hashPassword(password);
  return db.createMember({
    teamId,
    username,
    displayName,
    passwordHash: hashed.passwordHash,
    passwordSalt: hashed.passwordSalt,
    role,
  });
}

test.after(() => {
  db.closeDb();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('task API lists today tasks, patches text, and confirms report', async () => {
  auth.clearRateLimitState();
  const team = db.createTeam({ name: 'Task API Team' });
  const member = createMemberWithPassword({
    teamId: team.id,
    username: 'task-user',
    displayName: 'Task User',
    password: 'task-password',
  });
  const task = db.createReportTask({
    teamId: team.id,
    memberId: member.id,
    reportDate: '2026-06-24',
    prompt: ['done', 'next', 'blockers'],
  });

  const { server, baseUrl } = await startApp();
  try {
    const cookie = await login(baseUrl, {
      teamId: team.id,
      name: 'task-user',
      password: 'task-password',
    });

    let res = await fetch(`${baseUrl}/api/tasks/today?date=2026-06-24`, { headers: { cookie } });
    assert.equal(res.status, 200);
    let body = await res.json();
    assert.equal(body.report_date, '2026-06-24');
    assert.equal(body.tasks.length, 1);
    assert.equal(body.tasks[0].id, task.id);

    res = await fetch(`${baseUrl}/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        yesterday_text: 'Finished auth.',
        today_text: 'Build report APIs.',
      }),
    });
    assert.equal(res.status, 200);
    body = await res.json();
    assert.equal(body.task.status, 'in_progress');
    assert.equal(body.task.yesterday_text, 'Finished auth.');
    assert.equal(body.task.today_text, 'Build report APIs.');
    assert.ok(body.task.started_at);

    res = await fetch(`${baseUrl}/api/tasks/${task.id}/confirm`, {
      method: 'POST',
      headers: { cookie },
    });
    assert.equal(res.status, 200);
    body = await res.json();
    assert.equal(body.task.status, 'completed');
    assert.ok(body.task.completed_at);

    res = await fetch(`${baseUrl}/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ today_text: 'Too late.' }),
    });
    assert.equal(res.status, 409);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('task API prevents members from accessing other member tasks', async () => {
  auth.clearRateLimitState();
  const team = db.createTeam({ name: 'Access Team' });
  const owner = createMemberWithPassword({
    teamId: team.id,
    username: 'owner',
    displayName: 'Owner',
    password: 'owner-password',
  });
  createMemberWithPassword({
    teamId: team.id,
    username: 'intruder',
    displayName: 'Intruder',
    password: 'intruder-password',
  });
  const task = db.createReportTask({
    teamId: team.id,
    memberId: owner.id,
    reportDate: '2026-06-24',
  });

  const { server, baseUrl } = await startApp();
  try {
    const cookie = await login(baseUrl, {
      teamId: team.id,
      name: 'intruder',
      password: 'intruder-password',
    });
    const res = await fetch(`${baseUrl}/api/tasks/${task.id}/conversation`, { headers: { cookie } });
    assert.equal(res.status, 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('conversation endpoint stores chat and updates AI summary from markers', async () => {
  auth.clearRateLimitState();
  const team = db.createTeam({ name: 'Conversation Team' });
  const member = createMemberWithPassword({
    teamId: team.id,
    username: 'convo-user',
    displayName: 'Convo User',
    password: 'convo-password',
  });
  const task = db.createReportTask({
    teamId: team.id,
    memberId: member.id,
    reportDate: '2026-06-24',
    yesterdayText: 'Set up lifecycle.',
  });

  const aiCalls = [];
  const aiClient = async (conversation) => {
    aiCalls.push(conversation);
    return {
      text: 'Thanks, noted.\n\n[SUMMARY_START]\nLifecycle done; API work underway.\n[SUMMARY_END]',
      provider: 'fake',
      model: 'fake-model',
    };
  };

  const { server, baseUrl } = await startApp({ aiClient });
  try {
    const cookie = await login(baseUrl, {
      teamId: team.id,
      name: 'convo-user',
      password: 'convo-password',
    });

    let res = await fetch(`${baseUrl}/api/tasks/${task.id}/conversation`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ message: 'Today I am building the task API.' }),
    });
    assert.equal(res.status, 200);
    let body = await res.json();
    assert.equal(body.task.status, 'in_progress');
    assert.equal(body.task.ai_summary, 'Lifecycle done; API work underway.');
    assert.equal(body.messages.length, 2);
    assert.equal(body.messages[0].role, 'user');
    assert.equal(body.messages[1].role, 'assistant');
    assert.equal(body.messages[1].content, 'Thanks, noted.');
    assert.deepEqual(body.messages[1].meta, { provider: 'fake', model: 'fake-model' });
    assert.equal(aiCalls.length, 1);
    assert.match(aiCalls[0].systemPrompt, /Yesterday text: Set up lifecycle/);

    res = await fetch(`${baseUrl}/api/tasks/${task.id}/conversation`, { headers: { cookie } });
    assert.equal(res.status, 200);
    body = await res.json();
    assert.equal(body.messages.length, 2);
    assert.equal(body.messages[0].content, 'Today I am building the task API.');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
