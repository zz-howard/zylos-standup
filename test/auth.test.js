import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zylos-standup-auth-test-'));
process.env.STANDUP_DATA_DIR = tempDir;
fs.writeFileSync(path.join(tempDir, 'config.json'), JSON.stringify({ enabled: true }, null, 2));

const db = await import('../src/lib/db.js');
const auth = await import('../src/lib/auth.js');

function startApp() {
  const app = express();
  app.set('trust proxy', 'loopback');
  app.use(express.json());
  auth.setupAuthRoutes(app);
  app.get('/api/protected', (req, res) => res.json({ ok: true, member: req.member }));
  app.get('/api/admin', auth.adminRequired, (req, res) => res.json({ ok: true }));
  return new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

test.after(() => {
  db.closeDb();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('hashes and verifies scrypt passwords without storing plaintext', () => {
  const hashed = auth.hashPassword('secret');
  assert.match(hashed.passwordHash, /^scrypt:/);
  assert.notEqual(hashed.passwordHash, 'secret');
  assert.notEqual(hashed.passwordSalt, 'secret');
  assert.equal(auth.verifyPassword('secret', hashed.passwordHash, hashed.passwordSalt), true);
  assert.equal(auth.verifyPassword('wrong', hashed.passwordHash, hashed.passwordSalt), false);
});

test('login, me, protected API, admin gate, and logout flow', async () => {
  auth.clearRateLimitState();
  const team = db.createTeam({ name: 'Engineering' });
  const adminPassword = auth.hashPassword('admin-password');
  const memberPassword = auth.hashPassword('member-password');
  db.createMember({
    teamId: team.id,
    username: 'alice',
    displayName: 'Alice',
    role: 'admin',
    passwordHash: adminPassword.passwordHash,
    passwordSalt: adminPassword.passwordSalt,
  });
  db.createMember({
    teamId: team.id,
    username: 'bob',
    displayName: 'Bob',
    role: 'member',
    passwordHash: memberPassword.passwordHash,
    passwordSalt: memberPassword.passwordSalt,
  });

  const { server, baseUrl } = await startApp();
  try {
    let res = await fetch(`${baseUrl}/api/auth/me`);
    assert.equal(res.status, 401);
    res = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST' });
    assert.equal(res.status, 401);

    res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ team_id: team.id, name: 'alice', password: 'admin-password' }),
    });
    assert.equal(res.status, 200);
    const setCookie = res.headers.get('set-cookie');
    assert.match(setCookie, /__Host-zylos_standup_session=/);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /Secure/);
    const cookie = setCookie.split(';')[0];

    const loginBody = await res.json();
    assert.equal(loginBody.member.username, 'alice');
    assert.equal(loginBody.member.password_hash, undefined);
    assert.equal(loginBody.member.password_salt, undefined);

    res = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie } });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).member.role, 'admin');

    res = await fetch(`${baseUrl}/api/admin`, { headers: { cookie } });
    assert.equal(res.status, 200);

    res = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { cookie } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('set-cookie'), /Max-Age=0/);

    res = await fetch(`${baseUrl}/api/protected`, { headers: { cookie } });
    assert.equal(res.status, 401);

    res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ team_id: team.id, name: 'bob', password: 'member-password' }),
    });
    assert.equal(res.status, 200);
    const memberCookie = res.headers.get('set-cookie').split(';')[0];
    res = await fetch(`${baseUrl}/api/admin`, { headers: { cookie: memberCookie } });
    assert.equal(res.status, 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('invalid login is rate limited', async () => {
  auth.clearRateLimitState();
  const { server, baseUrl } = await startApp();
  try {
    const attempts = [];
    for (let i = 0; i < 6; i += 1) {
      attempts.push(await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '203.0.113.10',
        },
        body: JSON.stringify({ team_id: 999, name: 'nobody', password: 'bad' }),
      }));
    }
    assert.equal(attempts[0].status, 401);
    assert.equal(attempts[4].status, 401);
    assert.equal(attempts[5].status, 429);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('expired sessions are cleaned up and rejected', () => {
  const team = db.createTeam({ name: 'Ops' });
  const password = auth.hashPassword('ops-password');
  const member = db.createMember({
    teamId: team.id,
    username: 'ops',
    displayName: 'Ops',
    passwordHash: password.passwordHash,
    passwordSalt: password.passwordSalt,
  });
  const token = auth.createSessionForMember(member.id, false);
  db.getDb().prepare(`
    UPDATE sessions
    SET created_at = ?, last_activity_at = ?
    WHERE member_id = ?
  `).run(1, 1, member.id);

  assert.equal(auth.cleanupExpiredSessions(Date.now()), 1);
  assert.equal(auth.validateSessionToken(token), null);
});
