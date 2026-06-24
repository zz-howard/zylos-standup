import express from 'express';
import { adminRequired, hashPassword } from './auth.js';
import {
  createMember,
  createTeam,
  getMember,
  getTeam,
  listDailySchedules,
  listMembers,
  listTeams,
  sanitizeMember,
  updateMember,
  upsertDailySchedule,
} from './db.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function requireTeam(req, res) {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'invalid_team_id' });
    return null;
  }
  const team = getTeam(id);
  if (!team) {
    res.status(404).json({ error: 'team_not_found' });
    return null;
  }
  return team;
}

function validateTeamPayload(body) {
  const name = String(body?.name || '').trim();
  if (!name) return { error: 'name_required' };
  return {
    name,
    timezone: body.timezone ? String(body.timezone).trim() : 'Asia/Singapore',
    active: body.active === undefined ? true : Boolean(body.active),
  };
}

function validateMemberPayload(body) {
  const username = String(body?.username || '').trim();
  const displayName = String(body?.display_name || body?.displayName || '').trim();
  const password = body?.password === undefined ? null : String(body.password);
  if (!username) return { error: 'username_required' };
  if (!displayName) return { error: 'display_name_required' };
  if (!password) return { error: 'password_required' };
  const role = body.role === 'admin' ? 'admin' : 'member';
  return { username, displayName, password, role };
}

function serializeSchedule(row) {
  return {
    date: row.date,
    is_workday: Boolean(row.is_workday),
    reason: row.reason,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function setupTeamRoutes(app) {
  const router = express.Router();
  router.use(adminRequired);

  router.get('/', (req, res) => {
    return res.json({ teams: listTeams() });
  });

  router.post('/', (req, res) => {
    const payload = validateTeamPayload(req.body || {});
    if (payload.error) return res.status(400).json({ error: payload.error });
    const team = createTeam(payload);
    return res.status(201).json({ team });
  });

  router.get('/:id/members', (req, res) => {
    const team = requireTeam(req, res);
    if (!team) return null;
    const members = listMembers({
      teamId: team.id,
      active: req.query.active === 'false' ? false : true,
    }).map(sanitizeMember);
    return res.json({ team, members });
  });

  router.post('/:id/members', (req, res) => {
    const team = requireTeam(req, res);
    if (!team) return null;
    const payload = validateMemberPayload(req.body || {});
    if (payload.error) return res.status(400).json({ error: payload.error });
    const { passwordHash, passwordSalt } = hashPassword(payload.password);
    const member = createMember({
      teamId: team.id,
      username: payload.username,
      displayName: payload.displayName,
      role: payload.role,
      passwordHash,
      passwordSalt,
    });
    return res.status(201).json({ member: sanitizeMember(member) });
  });

  router.delete('/:id/members/:mid', (req, res) => {
    const team = requireTeam(req, res);
    if (!team) return null;
    const memberId = parseId(req.params.mid);
    if (!memberId) return res.status(400).json({ error: 'invalid_member_id' });
    const member = getMember(memberId);
    if (!member || member.team_id !== team.id) return res.status(404).json({ error: 'member_not_found' });
    if (member.id === req.member.id) return res.status(409).json({ error: 'cannot_remove_self' });
    const updated = updateMember(member.id, { active: false });
    return res.json({ member: sanitizeMember(updated) });
  });

  router.get('/:id/schedule', (req, res) => {
    const team = requireTeam(req, res);
    if (!team) return null;
    const month = String(req.query.month || '').trim();
    if (month && !MONTH_RE.test(month)) return res.status(400).json({ error: 'invalid_month' });
    const schedules = listDailySchedules()
      .filter(row => !month || row.date.startsWith(`${month}-`))
      .map(serializeSchedule);
    return res.json({ team_id: team.id, month: month || null, schedules });
  });

  router.put('/:id/schedule/:date', (req, res) => {
    const team = requireTeam(req, res);
    if (!team) return null;
    const date = String(req.params.date || '');
    if (!DATE_RE.test(date)) return res.status(400).json({ error: 'invalid_date' });
    if (req.body?.is_workday === undefined) return res.status(400).json({ error: 'is_workday_required' });
    const schedule = upsertDailySchedule({
      date,
      isWorkday: Boolean(req.body.is_workday),
      reason: req.body.reason === undefined ? null : String(req.body.reason),
    });
    return res.json({ schedule: serializeSchedule(schedule) });
  });

  app.use('/api/teams', router);
}
