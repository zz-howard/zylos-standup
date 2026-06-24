import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zylos-standup-team-api-'));
process.env.STANDUP_DATA_DIR = tempDir;
fs.writeFileSync(path.join(tempDir, 'config.json'), JSON.stringify({ enabled: true }, null, 2));

const db = await import('../src/lib/db.js');
const auth = await import('../src/lib/auth.js');
const teamApi = await import('../src/lib/team-api.js');

function startApp() {
  const app = express();
  app.set('trust proxy', 'loopback');
  app.use(express.json());
  auth.setupAuthRoutes(app);
  teamApi.setupTeamRoutes(app);
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

test.after(() => {
  db.closeDb();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('team management API requires admin role', async () => {
  auth.clearRateLimitState();
  const team = db.createTeam({ name: 'Admin Gate Team' });
  createMemberWithPassword({
    teamId: team.id,
    username: 'ordinary',
    displayName: 'Ordinary',
    password: 'ordinary-password',
  });

  const { server, baseUrl } = await startApp();
  try {
    let res = await fetch(`${baseUrl}/api/teams`);
    assert.equal(res.status, 401);

    const cookie = await login(baseUrl, {
      teamId: team.id,
      name: 'ordinary',
      password: 'ordinary-password',
    });
    res = await fetch(`${baseUrl}/api/teams`, { headers: { cookie } });
    assert.equal(res.status, 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('admin can create teams and manage members without leaking password fields', async () => {
  auth.clearRateLimitState();
  const homeTeam = db.createTeam({ name: 'Home Team' });
  createMemberWithPassword({
    teamId: homeTeam.id,
    username: 'admin-team',
    displayName: 'Admin Team',
    password: 'admin-password',
    role: 'admin',
  });

  const { server, baseUrl } = await startApp();
  try {
    const cookie = await login(baseUrl, {
      teamId: homeTeam.id,
      name: 'admin-team',
      password: 'admin-password',
    });

    let res = await fetch(`${baseUrl}/api/teams`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'Platform', timezone: 'UTC' }),
    });
    assert.equal(res.status, 201);
    let body = await res.json();
    assert.equal(body.team.name, 'Platform');
    assert.equal(body.team.timezone, 'UTC');
    const teamId = body.team.id;

    res = await fetch(`${baseUrl}/api/teams`, { headers: { cookie } });
    assert.equal(res.status, 200);
    body = await res.json();
    assert.ok(body.teams.some(team => team.id === teamId));

    res = await fetch(`${baseUrl}/api/teams/${teamId}/members`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        username: 'new-member',
        display_name: 'New Member',
        password: 'new-member-password',
        role: 'member',
      }),
    });
    assert.equal(res.status, 201);
    body = await res.json();
    assert.equal(body.member.username, 'new-member');
    assert.equal(body.member.password_hash, undefined);
    assert.equal(body.member.password_salt, undefined);
    const memberId = body.member.id;

    res = await fetch(`${baseUrl}/api/teams/${teamId}/members`, { headers: { cookie } });
    assert.equal(res.status, 200);
    body = await res.json();
    assert.equal(body.members.length, 1);
    assert.equal(body.members[0].id, memberId);
    assert.equal(body.members[0].password_hash, undefined);

    res = await fetch(`${baseUrl}/api/teams/${teamId}/members/${memberId}`, {
      method: 'DELETE',
      headers: { cookie },
    });
    assert.equal(res.status, 200);
    body = await res.json();
    assert.equal(body.member.active, 0);

    res = await fetch(`${baseUrl}/api/teams/${teamId}/members`, { headers: { cookie } });
    assert.equal(res.status, 200);
    body = await res.json();
    assert.equal(body.members.length, 0);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('admin can list and set monthly workday schedule overrides', async () => {
  auth.clearRateLimitState();
  const team = db.createTeam({ name: 'Schedule Team' });
  createMemberWithPassword({
    teamId: team.id,
    username: 'schedule-admin',
    displayName: 'Schedule Admin',
    password: 'schedule-password',
    role: 'admin',
  });

  const { server, baseUrl } = await startApp();
  try {
    const cookie = await login(baseUrl, {
      teamId: team.id,
      name: 'schedule-admin',
      password: 'schedule-password',
    });

    let res = await fetch(`${baseUrl}/api/teams/${team.id}/schedule/2026-06-27`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ is_workday: true, reason: 'make-up day' }),
    });
    assert.equal(res.status, 200);
    let body = await res.json();
    assert.equal(body.schedule.date, '2026-06-27');
    assert.equal(body.schedule.is_workday, true);
    assert.equal(body.schedule.reason, 'make-up day');

    res = await fetch(`${baseUrl}/api/teams/${team.id}/schedule?month=2026-06`, { headers: { cookie } });
    assert.equal(res.status, 200);
    body = await res.json();
    assert.equal(body.month, '2026-06');
    assert.ok(body.schedules.some(row => row.date === '2026-06-27' && row.is_workday === true));

    res = await fetch(`${baseUrl}/api/teams/${team.id}/schedule?month=bad`, { headers: { cookie } });
    assert.equal(res.status, 400);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
