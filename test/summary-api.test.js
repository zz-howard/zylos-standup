import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zylos-standup-summary-api-'));
const pagesDir = path.join(tempDir, 'pages');
process.env.STANDUP_DATA_DIR = tempDir;
process.env.STANDUP_PAGES_DIR = pagesDir;
fs.writeFileSync(path.join(tempDir, 'config.json'), JSON.stringify({ enabled: true }, null, 2));

const db = await import('../src/lib/db.js');
const auth = await import('../src/lib/auth.js');
const summaryApi = await import('../src/lib/summary-api.js');

function startApp({ aiClient } = {}) {
  const app = express();
  app.set('trust proxy', 'loopback');
  app.use(express.json());
  auth.setupAuthRoutes(app);
  summaryApi.setupSummaryRoutes(app, { aiClient });
  return new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

function createMemberWithPassword({ teamId, username, displayName, password, role = 'member' }) {
  const hashed = auth.hashPassword(password);
  return db.createMember({
    teamId,
    username,
    displayName,
    role,
    passwordHash: hashed.passwordHash,
    passwordSalt: hashed.passwordSalt,
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

function completeTask({ teamId, memberId, reportDate, yesterdayText, todayText, aiSummary }) {
  const task = db.createReportTask({
    teamId,
    memberId,
    reportDate,
    yesterdayText,
    todayText,
  });
  db.updateReportTask(task.id, { aiSummary });
  db.updateReportTaskStatus(task.id, 'in_progress');
  return db.updateReportTaskStatus(task.id, 'completed');
}

test.after(() => {
  db.closeDb();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('admin can generate and retrieve detailed and brief daily summaries', async () => {
  auth.clearRateLimitState();
  const team = db.createTeam({ name: 'Platform Team' });
  const admin = createMemberWithPassword({
    teamId: team.id,
    username: 'summary-admin',
    displayName: 'Summary Admin',
    password: 'summary-password',
    role: 'admin',
  });
  const member = createMemberWithPassword({
    teamId: team.id,
    username: 'reporter',
    displayName: 'Reporter',
    password: 'reporter-password',
  });
  const other = createMemberWithPassword({
    teamId: team.id,
    username: 'other-reporter',
    displayName: 'Other Reporter',
    password: 'other-password',
  });

  const firstTask = completeTask({
    teamId: team.id,
    memberId: member.id,
    reportDate: '2026-06-24',
    yesterdayText: 'Finished auth API.',
    todayText: 'Building summary API.',
    aiSummary: 'Auth API is done and summary API is underway.',
  });
  const secondTask = completeTask({
    teamId: team.id,
    memberId: other.id,
    reportDate: '2026-06-24',
    yesterdayText: 'Shipped frontend shell.',
    todayText: 'Connecting summary page.',
    aiSummary: 'Frontend shell is ready; summary page integration is next.',
  });
  const ignoredTask = db.createReportTask({
    teamId: team.id,
    memberId: admin.id,
    reportDate: '2026-06-24',
    yesterdayText: 'Not done yet.',
  });
  db.updateReportTaskStatus(ignoredTask.id, 'in_progress');

  let aiRequest;
  const aiClient = async (request) => {
    aiRequest = request;
    return {
      text: [
        'Overall status: Summary generation is on track.',
        'Key progress: Auth and frontend work are complete.',
        'Attention items: Keep an eye on the summary page integration.',
        'Tomorrow focus: Validate the generated Pages artifact.',
      ].join('\n'),
    };
  };

  const { server, baseUrl } = await startApp({ aiClient });
  try {
    const cookie = await login(baseUrl, {
      teamId: team.id,
      name: 'summary-admin',
      password: 'summary-password',
    });

    let res = await fetch(`${baseUrl}/api/summaries/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ team_id: team.id, date: '2026-06-24' }),
    });
    assert.equal(res.status, 202);
    let body = await res.json();
    assert.equal(body.summary.status, 'ready');
    assert.match(body.summary.brief_text, /Overall status/);
    assert.match(body.summary.content, /## Reporter/);
    assert.match(body.summary.content, /## Other Reporter/);
    assert.doesNotMatch(body.summary.content, /Not done yet/);
    assert.deepEqual(body.summary.meta.taskIds.toSorted((a, b) => a - b), [firstTask.id, secondTask.id]);
    assert.equal(aiRequest.scenario, 'summary');
    assert.match(aiRequest.systemPrompt, /400-600 word digest/);
    assert.match(aiRequest.messages[0].content, /Auth API is done/);

    const expectedPath = path.join(pagesDir, 'platform-team', '2026-06-24.md');
    assert.equal(body.summary.full_html_path, expectedPath);
    assert.equal(fs.existsSync(expectedPath), true);
    assert.match(fs.readFileSync(expectedPath, 'utf8'), /# Platform Team Standup - 2026-06-24/);

    res = await fetch(`${baseUrl}/api/summaries/${team.id}/2026-06-24`, { headers: { cookie } });
    assert.equal(res.status, 200);
    body = await res.json();
    assert.equal(body.summary.full_html_path, expectedPath);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('summary generate requires admin and GET is limited to the same team unless admin', async () => {
  auth.clearRateLimitState();
  const team = db.createTeam({ name: 'Summary Gate Team' });
  const otherTeam = db.createTeam({ name: 'Other Summary Gate Team' });
  createMemberWithPassword({
    teamId: team.id,
    username: 'summary-member',
    displayName: 'Summary Member',
    password: 'member-password',
  });
  createMemberWithPassword({
    teamId: otherTeam.id,
    username: 'other-summary-member',
    displayName: 'Other Summary Member',
    password: 'other-password',
  });
  db.upsertSummary({
    teamId: team.id,
    summaryDate: '2026-06-24',
    status: 'ready',
    content: 'Team summary',
    briefText: 'Brief',
    fullHtmlPath: '/tmp/summary.md',
  });

  const { server, baseUrl } = await startApp({
    aiClient: async () => ({ text: 'Brief' }),
  });
  try {
    let res = await fetch(`${baseUrl}/api/summaries/${team.id}/2026-06-24`);
    assert.equal(res.status, 401);

    const cookie = await login(baseUrl, {
      teamId: team.id,
      name: 'summary-member',
      password: 'member-password',
    });
    res = await fetch(`${baseUrl}/api/summaries/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ team_id: team.id, date: '2026-06-24' }),
    });
    assert.equal(res.status, 403);

    res = await fetch(`${baseUrl}/api/summaries/${team.id}/2026-06-24`, { headers: { cookie } });
    assert.equal(res.status, 200);

    const otherCookie = await login(baseUrl, {
      teamId: otherTeam.id,
      name: 'other-summary-member',
      password: 'other-password',
    });
    res = await fetch(`${baseUrl}/api/summaries/${team.id}/2026-06-24`, { headers: { cookie: otherCookie } });
    assert.equal(res.status, 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('summary generate returns 404 for missing teams without calling AI', async () => {
  auth.clearRateLimitState();
  const team = db.createTeam({ name: 'Missing Team Gate' });
  createMemberWithPassword({
    teamId: team.id,
    username: 'missing-team-admin',
    displayName: 'Missing Team Admin',
    password: 'missing-password',
    role: 'admin',
  });
  let aiCalled = false;
  const { server, baseUrl } = await startApp({
    aiClient: async () => {
      aiCalled = true;
      return { text: 'should not happen' };
    },
  });
  try {
    const cookie = await login(baseUrl, {
      teamId: team.id,
      name: 'missing-team-admin',
      password: 'missing-password',
    });
    const res = await fetch(`${baseUrl}/api/summaries/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ team_id: 999999, date: '2026-06-24' }),
    });
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'team_not_found' });
    assert.equal(aiCalled, false);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('failed AI summary generation records failed summary without writing Pages markdown', async () => {
  auth.clearRateLimitState();
  const team = db.createTeam({ name: 'Failure Team' });
  const admin = createMemberWithPassword({
    teamId: team.id,
    username: 'failure-admin',
    displayName: 'Failure Admin',
    password: 'failure-password',
    role: 'admin',
  });
  completeTask({
    teamId: team.id,
    memberId: admin.id,
    reportDate: '2026-06-25',
    yesterdayText: 'Started summary.',
    todayText: 'Testing failures.',
    aiSummary: 'Failure test is in progress.',
  });

  const { server, baseUrl } = await startApp({
    aiClient: async () => {
      throw new Error('AI unavailable');
    },
  });
  try {
    const cookie = await login(baseUrl, {
      teamId: team.id,
      name: 'failure-admin',
      password: 'failure-password',
    });
    const res = await fetch(`${baseUrl}/api/summaries/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ team_id: team.id, date: '2026-06-25' }),
    });
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.equal(body.summary.status, 'failed');
    assert.equal(body.summary.brief_text, null);
    assert.equal(body.summary.full_html_path, null);
    assert.equal(body.summary.error_message, 'AI unavailable');
    assert.equal(fs.existsSync(path.join(pagesDir, 'failure-team', '2026-06-25.md')), false);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
