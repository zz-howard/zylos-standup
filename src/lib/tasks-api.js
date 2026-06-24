import express from 'express';
import {
  addReportConversation,
  getReportTask,
  listReportConversations,
  listReportTasks,
  updateReportTask,
  updateReportTaskStatus,
} from './db.js';
import { getConfig } from './config.js';
import { generateConversationReply } from '../ai/conversation.js';

function todayInTimezone(timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function canAccessTask(member, task) {
  if (!member || !task) return false;
  if (task.member_id === member.id) return true;
  return member.role === 'admin' && task.team_id === member.team_id;
}

function getAccessibleTask(req, res) {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'invalid_task_id' });
    return null;
  }
  const task = getReportTask(id);
  if (!task) {
    res.status(404).json({ error: 'task_not_found' });
    return null;
  }
  if (!canAccessTask(req.member, task)) {
    res.status(403).json({ error: 'forbidden' });
    return null;
  }
  return task;
}

function ensureInProgress(task) {
  if (task.status === 'pending') return updateReportTaskStatus(task.id, 'in_progress');
  return task;
}

function completeTask(task) {
  const inProgress = ensureInProgress(task);
  if (inProgress.status === 'completed') return inProgress;
  return updateReportTaskStatus(inProgress.id, 'completed');
}

function serializeConversation(row) {
  return {
    id: row.id,
    task_id: row.task_id,
    role: row.role,
    content: row.content,
    meta: row.meta,
    created_at: row.created_at,
  };
}

export function setupTaskRoutes(app, { aiClient } = {}) {
  const router = express.Router();

  router.get('/today', (req, res) => {
    const reportDate = req.query.date || todayInTimezone(getConfig().reports?.defaultTimezone);
    const tasks = listReportTasks({
      memberId: req.member.id,
      reportDate,
    });
    return res.json({ report_date: reportDate, tasks });
  });

  router.patch('/:id', (req, res) => {
    const task = getAccessibleTask(req, res);
    if (!task) return null;
    if (task.status === 'completed') {
      return res.status(409).json({ error: 'task_completed' });
    }

    const allowed = {};
    if (req.body?.yesterday_text !== undefined) allowed.yesterdayText = String(req.body.yesterday_text);
    if (req.body?.today_text !== undefined) allowed.todayText = String(req.body.today_text);
    const patched = updateReportTask(task.id, allowed);
    const updated = ensureInProgress(patched);
    return res.json({ task: updated });
  });

  router.post('/:id/confirm', (req, res) => {
    const task = getAccessibleTask(req, res);
    if (!task) return null;
    const updated = completeTask(task);
    return res.json({ task: updated });
  });

  router.get('/:id/conversation', (req, res) => {
    const task = getAccessibleTask(req, res);
    if (!task) return null;
    return res.json({
      task,
      messages: listReportConversations(task.id).map(serializeConversation),
    });
  });

  router.post('/:id/conversation', async (req, res) => {
    const task = getAccessibleTask(req, res);
    if (!task) return null;
    if (task.status === 'completed') {
      return res.status(409).json({ error: 'task_completed' });
    }

    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: 'message_required' });

    const history = listReportConversations(task.id);
    const userRow = addReportConversation({ taskId: task.id, role: 'user', content: message });
    const workingTask = ensureInProgress(task);

    try {
      const reply = await generateConversationReply({
        task: workingTask,
        history,
        userMessage: message,
        aiClient,
      });
      const assistantRow = addReportConversation({
        taskId: task.id,
        role: 'assistant',
        content: reply.replyText,
        meta: reply.meta,
      });
      const updatedTask = reply.summary
        ? updateReportTask(task.id, { aiSummary: reply.summary })
        : getReportTask(task.id);
      return res.json({
        task: updatedTask,
        messages: [serializeConversation(userRow), serializeConversation(assistantRow)],
      });
    } catch (err) {
      console.error('[standup] AI conversation failed:', err);
      return res.status(502).json({ error: 'ai_conversation_failed' });
    }
  });

  app.use('/api/tasks', router);
}
