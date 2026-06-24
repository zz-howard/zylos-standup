import crypto from 'node:crypto';
import express from 'express';
import {
  createSession,
  deleteExpiredSessions,
  deleteSession,
  getMemberByTeamAndName,
  getSession,
  sanitizeMember,
  touchSession,
} from './db.js';

const SCRYPT_KEYLEN = 64;
const COOKIE_NAME = '__Host-zylos_standup_session';
const SESSION_ABSOLUTE_MS = 12 * 60 * 60 * 1000;
const SESSION_IDLE_MS = 60 * 60 * 1000;
const REMEMBER_ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;
const REMEMBER_IDLE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FAILURES = 5;
const WINDOW_MS = 60_000;
const LOCKOUT_MS = 10 * 60_000;
const GLOBAL_MAX_PER_MIN = 30;

const failedAttempts = new Map();
let globalFailures = { count: 0, resetAt: Date.now() + WINDOW_MS };

export function hashPassword(plaintext) {
  const passwordSalt = crypto.randomBytes(32).toString('hex');
  const hash = crypto.scryptSync(plaintext, Buffer.from(passwordSalt, 'hex'), SCRYPT_KEYLEN).toString('hex');
  return { passwordHash: `scrypt:${hash}`, passwordSalt };
}

export function verifyPassword(plaintext, passwordHash, passwordSalt) {
  try {
    if (!passwordHash || !passwordHash.startsWith('scrypt:') || !passwordSalt) return false;
    const expected = Buffer.from(passwordHash.slice('scrypt:'.length), 'hex');
    if (expected.length !== SCRYPT_KEYLEN) return false;
    const actual = crypto.scryptSync(plaintext, Buffer.from(passwordSalt, 'hex'), SCRYPT_KEYLEN);
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  for (const pair of header.split(';')) {
    const [name, ...rest] = pair.trim().split('=');
    if (name) cookies[name] = decodeURIComponent(rest.join('='));
  }
  return cookies;
}

function getSessionToken(req) {
  return parseCookies(req.headers.cookie)[COOKIE_NAME] || null;
}

function setSessionCookie(res, token, remember = false) {
  const maxAge = remember ? 30 * 86400 : 12 * 3600;
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: maxAge * 1000,
  });
}

function clearSessionCookie(res) {
  res.cookie(COOKIE_NAME, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
}

function getClientIp(req) {
  const remoteIp = req.socket.remoteAddress || '';
  if (['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remoteIp)) {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) return forwardedFor.split(',')[0].trim();
  }
  return remoteIp;
}

function isGlobalLimited() {
  const now = Date.now();
  if (now > globalFailures.resetAt) {
    globalFailures = { count: 0, resetAt: now + WINDOW_MS };
  }
  return globalFailures.count >= GLOBAL_MAX_PER_MIN;
}

function isLockedOut(ip) {
  const record = failedAttempts.get(ip);
  if (!record) return false;
  const now = Date.now();
  if (record.count >= MAX_FAILURES) {
    if (now - record.firstFailAt < LOCKOUT_MS) return true;
    failedAttempts.delete(ip);
    return false;
  }
  if (now - record.firstFailAt > WINDOW_MS) {
    failedAttempts.delete(ip);
    return false;
  }
  return false;
}

function recordFailure(ip) {
  const now = Date.now();
  const record = failedAttempts.get(ip);
  if (!record || now - record.firstFailAt > WINDOW_MS) {
    failedAttempts.set(ip, { count: 1, firstFailAt: now });
  } else {
    record.count += 1;
  }
  if (now > globalFailures.resetAt) {
    globalFailures = { count: 1, resetAt: now + WINDOW_MS };
  } else {
    globalFailures.count += 1;
  }
}

function clearFailures(ip) {
  failedAttempts.delete(ip);
}

export function clearRateLimitState() {
  failedAttempts.clear();
  globalFailures = { count: 0, resetAt: Date.now() + WINDOW_MS };
}

export function createSessionForMember(memberId, remember = false) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  createSession({
    tokenHash: sha256(token),
    memberId,
    createdAt: now,
    lastActivityAt: now,
    remember,
  });
  return token;
}

export function validateSessionToken(token) {
  if (!token) return null;
  const tokenHash = sha256(token);
  const session = getSession(tokenHash);
  if (!session || session.active !== 1) return null;

  const now = Date.now();
  const absoluteMs = session.remember ? REMEMBER_ABSOLUTE_MS : SESSION_ABSOLUTE_MS;
  const idleMs = session.remember ? REMEMBER_IDLE_MS : SESSION_IDLE_MS;
  if (now - session.created_at > absoluteMs || now - session.last_activity_at > idleMs) {
    deleteSession(tokenHash);
    return null;
  }

  touchSession(tokenHash, now);
  return session;
}

export function cleanupExpiredSessions(now = Date.now()) {
  return deleteExpiredSessions(
    now,
    SESSION_ABSOLUTE_MS,
    SESSION_IDLE_MS,
    REMEMBER_ABSOLUTE_MS,
    REMEMBER_IDLE_MS,
  );
}

export function authRequired(req, res, next) {
  const session = validateSessionToken(getSessionToken(req));
  if (!session) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  req.member = sanitizeMember({
    id: session.member_id,
    team_id: session.team_id,
    username: session.username,
    display_name: session.display_name,
    role: session.role,
    active: session.active,
  });
  return next();
}

export function adminRequired(req, res, next) {
  if (!req.member) return res.status(401).json({ error: 'unauthorized' });
  if (req.member.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  return next();
}

export function setupAuthRoutes(app) {
  const router = express.Router();

  router.post('/login', (req, res) => {
    const ip = getClientIp(req);
    if (isGlobalLimited() || isLockedOut(ip)) {
      return res.status(429).json({ error: 'too_many_attempts' });
    }

    const { team_id, name, password, remember } = req.body || {};
    const teamId = Number(team_id);
    if (!Number.isInteger(teamId) || !name || !password) {
      recordFailure(ip);
      return res.status(400).json({ error: 'team_id, name, and password are required' });
    }

    const member = getMemberByTeamAndName(teamId, String(name));
    if (!member || !verifyPassword(String(password), member.password_hash, member.password_salt)) {
      recordFailure(ip);
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    clearFailures(ip);
    const token = createSessionForMember(member.id, Boolean(remember));
    setSessionCookie(res, token, Boolean(remember));
    return res.json({ member: sanitizeMember(member) });
  });

  router.post('/logout', authRequired, (req, res) => {
    const token = getSessionToken(req);
    if (token) deleteSession(sha256(token));
    clearSessionCookie(res);
    return res.json({ ok: true });
  });

  router.get('/me', authRequired, (req, res) => {
    return res.json({ member: req.member });
  });

  app.use('/api/auth', router);
  app.use('/api', authRequired);
}
