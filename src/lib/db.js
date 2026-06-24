/**
 * SQLite database layer for zylos-standup.
 *
 * Report task state machine:
 *   pending -> in_progress -> completed
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import { DATA_DIR, DB_PATH } from './config.js';

export const MEMBER_ROLES = ['admin', 'member'];
export const TASK_STATUSES = ['pending', 'in_progress', 'completed'];
export const CONVERSATION_ROLES = ['user', 'assistant', 'system'];
export const SUMMARY_STATUSES = ['draft', 'ready', 'failed'];

let db = null;

export function getDb() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  runMigrations(db);
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      timezone    TEXT NOT NULL DEFAULT 'Asia/Singapore',
      active      INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS members (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id        INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      username       TEXT NOT NULL UNIQUE,
      display_name   TEXT NOT NULL,
      password_hash  TEXT,
      password_salt  TEXT,
      role           TEXT NOT NULL DEFAULT 'member'
                     CHECK (role IN ('admin','member')),
      active         INTEGER NOT NULL DEFAULT 1,
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_members_team ON members(team_id);
    CREATE INDEX IF NOT EXISTS idx_members_active ON members(active);

    CREATE TABLE IF NOT EXISTS report_tasks (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id        INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      member_id      INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      report_date    TEXT NOT NULL,
      status         TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','in_progress','completed')),
      yesterday_text TEXT,
      today_text     TEXT,
      ai_summary     TEXT,
      prompt_json    TEXT,
      started_at     TEXT,
      completed_at   TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(member_id, report_date)
    );

    CREATE INDEX IF NOT EXISTS idx_report_tasks_team_date ON report_tasks(team_id, report_date);
    CREATE INDEX IF NOT EXISTS idx_report_tasks_member ON report_tasks(member_id);
    CREATE INDEX IF NOT EXISTS idx_report_tasks_status ON report_tasks(status);

    CREATE TABLE IF NOT EXISTS report_conversations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id     INTEGER NOT NULL REFERENCES report_tasks(id) ON DELETE CASCADE,
      role        TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
      content     TEXT NOT NULL,
      meta_json   TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_report_conversations_task ON report_conversations(task_id);

    CREATE TABLE IF NOT EXISTS daily_schedules (
      date        TEXT PRIMARY KEY,
      is_workday  INTEGER NOT NULL CHECK (is_workday IN (0,1)),
      reason      TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS summaries (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id        INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      summary_date   TEXT NOT NULL,
      status         TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','ready','failed')),
      content        TEXT,
      brief_text     TEXT,
      full_html_path TEXT,
      meta_json      TEXT,
      generated_at   TEXT,
      error_message  TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(team_id, summary_date)
    );

    CREATE INDEX IF NOT EXISTS idx_summaries_team_date ON summaries(team_id, summary_date);
    CREATE INDEX IF NOT EXISTS idx_summaries_status ON summaries(status);

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash        TEXT PRIMARY KEY,
      member_id         INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      created_at        INTEGER NOT NULL,
      last_activity_at  INTEGER NOT NULL,
      remember          INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_member ON sessions(member_id);

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     INTEGER PRIMARY KEY,
      name        TEXT NOT NULL,
      applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function runMigrations(db) {
  const current = db.pragma('user_version', { simple: true });
  if (current < 1) {
    db.prepare(`
      INSERT OR IGNORE INTO schema_migrations (version, name)
      VALUES (1, 'initial_core_schema')
    `).run();
    db.pragma('user_version = 1');
  }
  if (current < 2) {
    addColumnIfMissing(db, 'report_tasks', 'yesterday_text', 'TEXT');
    addColumnIfMissing(db, 'report_tasks', 'today_text', 'TEXT');
    addColumnIfMissing(db, 'report_tasks', 'ai_summary', 'TEXT');
    db.prepare(`
      INSERT OR IGNORE INTO schema_migrations (version, name)
      VALUES (2, 'add_report_task_text_fields')
    `).run();
    db.pragma('user_version = 2');
  }
  if (current < 3) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash        TEXT PRIMARY KEY,
        member_id         INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        created_at        INTEGER NOT NULL,
        last_activity_at  INTEGER NOT NULL,
        remember          INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_member ON sessions(member_id);
    `);
    db.prepare(`
      INSERT OR IGNORE INTO schema_migrations (version, name)
      VALUES (3, 'add_auth_sessions')
    `).run();
    db.pragma('user_version = 3');
  }
  if (current < 4) {
    addColumnIfMissing(db, 'summaries', 'brief_text', 'TEXT');
    addColumnIfMissing(db, 'summaries', 'full_html_path', 'TEXT');
    db.prepare(`
      INSERT OR IGNORE INTO schema_migrations (version, name)
      VALUES (4, 'add_summary_outputs')
    `).run();
    db.pragma('user_version = 4');
  }
}

function addColumnIfMissing(db, table, column, definition) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column);
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function assertOneOf(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw new Error(`${field} must be one of: ${allowed.join(', ')}`);
  }
}

function assertTaskTransition(currentStatus, nextStatus) {
  if (currentStatus === nextStatus) return;
  const allowed = {
    pending: ['in_progress'],
    in_progress: ['completed'],
    completed: [],
  };
  if (!allowed[currentStatus]?.includes(nextStatus)) {
    throw new Error(`invalid report task status transition: ${currentStatus} -> ${nextStatus}`);
  }
}

function toJson(value) {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function fromJson(value) {
  if (!value) return null;
  return JSON.parse(value);
}

function hydrateTask(row) {
  if (!row) return null;
  return { ...row, prompt: fromJson(row.prompt_json) };
}

function hydrateConversation(row) {
  if (!row) return null;
  return { ...row, meta: fromJson(row.meta_json) };
}

function hydrateSummary(row) {
  if (!row) return null;
  return { ...row, meta: fromJson(row.meta_json) };
}

export function listTeams({ active } = {}) {
  const where = [];
  const params = [];
  if (active !== undefined) {
    where.push('active = ?');
    params.push(active ? 1 : 0);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return getDb().prepare(`
    SELECT * FROM teams
    ${clause}
    ORDER BY name ASC
  `).all(...params);
}

export function getTeam(id) {
  return getDb().prepare('SELECT * FROM teams WHERE id = ?').get(id) || null;
}

export function createTeam({ name, timezone = 'Asia/Singapore', active = true }) {
  const info = getDb().prepare(`
    INSERT INTO teams (name, timezone, active)
    VALUES (?, ?, ?)
  `).run(name, timezone, active ? 1 : 0);
  return getTeam(info.lastInsertRowid);
}

export function updateTeam(id, updates) {
  const fields = [];
  const params = [];
  if (updates.name !== undefined) { fields.push('name = ?'); params.push(updates.name); }
  if (updates.timezone !== undefined) { fields.push('timezone = ?'); params.push(updates.timezone); }
  if (updates.active !== undefined) { fields.push('active = ?'); params.push(updates.active ? 1 : 0); }
  if (!fields.length) return getTeam(id);
  fields.push("updated_at = datetime('now')");
  params.push(id);
  getDb().prepare(`UPDATE teams SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  return getTeam(id);
}

export function deleteTeam(id) {
  return getDb().prepare('DELETE FROM teams WHERE id = ?').run(id).changes;
}

export function listMembers({ teamId, active } = {}) {
  const where = [];
  const params = [];
  if (teamId) { where.push('team_id = ?'); params.push(teamId); }
  if (active !== undefined) { where.push('active = ?'); params.push(active ? 1 : 0); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return getDb().prepare(`
    SELECT * FROM members
    ${clause}
    ORDER BY display_name ASC
  `).all(...params);
}

export function getMember(id) {
  return getDb().prepare('SELECT * FROM members WHERE id = ?').get(id) || null;
}

export function getMemberByUsername(username) {
  return getDb().prepare('SELECT * FROM members WHERE username = ?').get(username) || null;
}

export function getMemberByTeamAndName(teamId, name) {
  return getDb().prepare(`
    SELECT * FROM members
    WHERE team_id = ? AND active = 1 AND (username = ? OR display_name = ?)
    ORDER BY CASE WHEN username = ? THEN 0 ELSE 1 END
    LIMIT 1
  `).get(teamId, name, name, name) || null;
}

export function createMember({
  teamId,
  username,
  displayName,
  passwordHash = null,
  passwordSalt = null,
  role = 'member',
  active = true,
}) {
  assertOneOf(role, MEMBER_ROLES, 'role');
  const info = getDb().prepare(`
    INSERT INTO members (team_id, username, display_name, password_hash, password_salt, role, active)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(teamId, username, displayName, passwordHash, passwordSalt, role, active ? 1 : 0);
  return getMember(info.lastInsertRowid);
}

export function updateMember(id, updates) {
  const fields = [];
  const params = [];
  if (updates.username !== undefined) { fields.push('username = ?'); params.push(updates.username); }
  if (updates.displayName !== undefined) { fields.push('display_name = ?'); params.push(updates.displayName); }
  if (updates.passwordHash !== undefined) { fields.push('password_hash = ?'); params.push(updates.passwordHash); }
  if (updates.passwordSalt !== undefined) { fields.push('password_salt = ?'); params.push(updates.passwordSalt); }
  if (updates.role !== undefined) {
    assertOneOf(updates.role, MEMBER_ROLES, 'role');
    fields.push('role = ?');
    params.push(updates.role);
  }
  if (updates.active !== undefined) { fields.push('active = ?'); params.push(updates.active ? 1 : 0); }
  if (!fields.length) return getMember(id);
  fields.push("updated_at = datetime('now')");
  params.push(id);
  getDb().prepare(`UPDATE members SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  return getMember(id);
}

export function deleteMember(id) {
  return getDb().prepare('DELETE FROM members WHERE id = ?').run(id).changes;
}

export function sanitizeMember(member) {
  if (!member) return null;
  const { password_hash, password_salt, ...safe } = member;
  return safe;
}

export function createSession({ tokenHash, memberId, createdAt, lastActivityAt, remember = false }) {
  getDb().prepare(`
    INSERT INTO sessions (token_hash, member_id, created_at, last_activity_at, remember)
    VALUES (?, ?, ?, ?, ?)
  `).run(tokenHash, memberId, createdAt, lastActivityAt, remember ? 1 : 0);
  return getSession(tokenHash);
}

export function getSession(tokenHash) {
  return getDb().prepare(`
    SELECT s.*, m.team_id, m.username, m.display_name, m.role, m.active
    FROM sessions s
    JOIN members m ON m.id = s.member_id
    WHERE s.token_hash = ?
  `).get(tokenHash) || null;
}

export function touchSession(tokenHash, timestamp) {
  return getDb().prepare(`
    UPDATE sessions SET last_activity_at = ? WHERE token_hash = ?
  `).run(timestamp, tokenHash).changes;
}

export function deleteSession(tokenHash) {
  return getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash).changes;
}

export function deleteExpiredSessions(now, sessionAbsoluteMs, sessionIdleMs, rememberAbsoluteMs, rememberIdleMs) {
  return getDb().prepare(`
    DELETE FROM sessions WHERE
      (remember = 0 AND (? - created_at > ? OR ? - last_activity_at > ?))
      OR
      (remember = 1 AND (? - created_at > ? OR ? - last_activity_at > ?))
  `).run(
    now, sessionAbsoluteMs, now, sessionIdleMs,
    now, rememberAbsoluteMs, now, rememberIdleMs,
  ).changes;
}

export function listReportTasks({ teamId, memberId, reportDate, status } = {}) {
  const where = [];
  const params = [];
  if (teamId) { where.push('team_id = ?'); params.push(teamId); }
  if (memberId) { where.push('member_id = ?'); params.push(memberId); }
  if (reportDate) { where.push('report_date = ?'); params.push(reportDate); }
  if (status) {
    assertOneOf(status, TASK_STATUSES, 'status');
    where.push('status = ?');
    params.push(status);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return getDb().prepare(`
    SELECT * FROM report_tasks
    ${clause}
    ORDER BY report_date DESC, id ASC
  `).all(...params).map(hydrateTask);
}

export function getReportTask(id) {
  return hydrateTask(getDb().prepare('SELECT * FROM report_tasks WHERE id = ?').get(id) || null);
}

export function getReportTaskForMemberDate(memberId, reportDate) {
  return hydrateTask(getDb().prepare(`
    SELECT * FROM report_tasks WHERE member_id = ? AND report_date = ?
  `).get(memberId, reportDate) || null);
}

export function createReportTask({
  teamId,
  memberId,
  reportDate,
  yesterdayText = null,
  todayText = null,
  aiSummary = null,
  prompt = null,
  status = 'pending',
}) {
  assertOneOf(status, TASK_STATUSES, 'status');
  const existing = getReportTaskForMemberDate(memberId, reportDate);
  if (existing) return existing;
  const info = getDb().prepare(`
    INSERT INTO report_tasks (
      team_id, member_id, report_date, yesterday_text, today_text, ai_summary, prompt_json, status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(teamId, memberId, reportDate, yesterdayText, todayText, aiSummary, toJson(prompt), status);
  return getReportTask(info.lastInsertRowid);
}

export function updateReportTask(id, updates) {
  const fields = [];
  const params = [];
  if (updates.yesterdayText !== undefined) {
    fields.push('yesterday_text = ?');
    params.push(updates.yesterdayText);
  }
  if (updates.todayText !== undefined) {
    fields.push('today_text = ?');
    params.push(updates.todayText);
  }
  if (updates.aiSummary !== undefined) {
    fields.push('ai_summary = ?');
    params.push(updates.aiSummary);
  }
  if (updates.prompt !== undefined) {
    fields.push('prompt_json = ?');
    params.push(toJson(updates.prompt));
  }
  if (!fields.length) return getReportTask(id);
  fields.push("updated_at = datetime('now')");
  params.push(id);
  getDb().prepare(`UPDATE report_tasks SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  return getReportTask(id);
}

export function updateReportTaskStatus(id, status) {
  assertOneOf(status, TASK_STATUSES, 'status');
  const current = getReportTask(id);
  if (!current) return null;
  assertTaskTransition(current.status, status);
  const timestamps = [];
  if (status === 'in_progress') timestamps.push("started_at = COALESCE(started_at, datetime('now'))");
  if (status === 'completed') timestamps.push("completed_at = COALESCE(completed_at, datetime('now'))");
  getDb().prepare(`
    UPDATE report_tasks
    SET status = ?, ${timestamps.join(', ')}${timestamps.length ? ', ' : ''}updated_at = datetime('now')
    WHERE id = ?
  `).run(status, id);
  return getReportTask(id);
}

export function deleteReportTask(id) {
  return getDb().prepare('DELETE FROM report_tasks WHERE id = ?').run(id).changes;
}

export function listReportConversations(taskId) {
  return getDb().prepare(`
    SELECT * FROM report_conversations
    WHERE task_id = ?
    ORDER BY id ASC
  `).all(taskId).map(hydrateConversation);
}

export function addReportConversation({ taskId, role, content, meta = null }) {
  assertOneOf(role, CONVERSATION_ROLES, 'role');
  const info = getDb().prepare(`
    INSERT INTO report_conversations (task_id, role, content, meta_json)
    VALUES (?, ?, ?, ?)
  `).run(taskId, role, content, toJson(meta));
  return hydrateConversation(getDb().prepare('SELECT * FROM report_conversations WHERE id = ?').get(info.lastInsertRowid));
}

export function listDailySchedules() {
  return getDb().prepare(`
    SELECT * FROM daily_schedules
    ORDER BY date ASC
  `).all();
}

export function getDailySchedule(date) {
  return getDb().prepare('SELECT * FROM daily_schedules WHERE date = ?').get(date) || null;
}

export function upsertDailySchedule({ date, isWorkday, reason = null }) {
  getDb().prepare(`
    INSERT INTO daily_schedules (date, is_workday, reason)
    VALUES (?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      is_workday = excluded.is_workday,
      reason = excluded.reason,
      updated_at = datetime('now')
  `).run(date, isWorkday ? 1 : 0, reason);
  return getDailySchedule(date);
}

export function deleteDailySchedule(date) {
  return getDb().prepare('DELETE FROM daily_schedules WHERE date = ?').run(date).changes;
}

export function listSummaries({ teamId, status } = {}) {
  const where = [];
  const params = [];
  if (teamId) { where.push('team_id = ?'); params.push(teamId); }
  if (status) {
    assertOneOf(status, SUMMARY_STATUSES, 'status');
    where.push('status = ?');
    params.push(status);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return getDb().prepare(`
    SELECT * FROM summaries
    ${clause}
    ORDER BY summary_date DESC
  `).all(...params).map(hydrateSummary);
}

export function getSummary(teamId, summaryDate) {
  return hydrateSummary(getDb().prepare(`
    SELECT * FROM summaries WHERE team_id = ? AND summary_date = ?
  `).get(teamId, summaryDate) || null);
}

export function upsertSummary({
  teamId,
  summaryDate,
  status = 'draft',
  content = null,
  briefText = null,
  fullHtmlPath = null,
  meta = null,
  errorMessage = null,
}) {
  assertOneOf(status, SUMMARY_STATUSES, 'status');
  getDb().prepare(`
    INSERT INTO summaries (
      team_id, summary_date, status, content, brief_text, full_html_path, meta_json, generated_at, error_message
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'ready' THEN datetime('now') ELSE NULL END, ?)
    ON CONFLICT(team_id, summary_date) DO UPDATE SET
      status = excluded.status,
      content = excluded.content,
      brief_text = excluded.brief_text,
      full_html_path = excluded.full_html_path,
      meta_json = excluded.meta_json,
      generated_at = excluded.generated_at,
      error_message = excluded.error_message,
      updated_at = datetime('now')
  `).run(
    teamId,
    summaryDate,
    status,
    content,
    briefText,
    fullHtmlPath,
    toJson(meta),
    status,
    errorMessage,
  );
  return getSummary(teamId, summaryDate);
}

export function deleteSummary(teamId, summaryDate) {
  return getDb().prepare(`
    DELETE FROM summaries WHERE team_id = ? AND summary_date = ?
  `).run(teamId, summaryDate).changes;
}
