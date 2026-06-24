import express from 'express';
import { adminRequired } from './auth.js';
import { getTeam } from './db.js';
import { generateDailySummary, getDailySummary } from './summary-service.js';

function parsePositiveInt(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

export function setupSummaryRoutes(app, { aiClient } = {}) {
  const router = express.Router();

  router.post('/generate', adminRequired, async (req, res) => {
    const teamId = parsePositiveInt(req.body?.team_id);
    const summaryDate = String(req.body?.date || '').trim();
    if (!teamId) return res.status(400).json({ error: 'team_id_required' });
    if (!isDate(summaryDate)) return res.status(400).json({ error: 'invalid_date' });
    if (!getTeam(teamId)) return res.status(404).json({ error: 'team_not_found' });
    const summary = await generateDailySummary({ teamId, summaryDate, aiClient });
    const status = summary.status === 'failed' ? 502 : 202;
    return res.status(status).json({ summary });
  });

  router.get('/:team_id/:date', (req, res) => {
    const teamId = parsePositiveInt(req.params.team_id);
    const summaryDate = String(req.params.date || '').trim();
    if (!teamId) return res.status(400).json({ error: 'invalid_team_id' });
    if (!isDate(summaryDate)) return res.status(400).json({ error: 'invalid_date' });
    if (req.member.role !== 'admin' && req.member.team_id !== teamId) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const summary = getDailySummary({ teamId, summaryDate });
    if (!summary) return res.status(404).json({ error: 'summary_not_found' });
    return res.json({ summary });
  });

  app.use('/api/summaries', router);
}
