import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import ChatPanel from '../components/ChatPanel.jsx';
import TaskCard from '../components/TaskCard.jsx';
import TaskEditor from '../components/TaskEditor.jsx';
import { Button } from '../components/ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { api, formatApiError } from '../lib/api.js';

export default function ReportPage() {
  const [tasks, setTasks] = useState([]);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [yesterday, setYesterday] = useState('');
  const [today, setToday] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) || tasks[0] || null,
    [tasks, selectedTaskId],
  );

  async function loadTasks(preferredTaskId = selectedTaskId) {
    setLoading(true);
    setError('');
    try {
      const body = await api('/api/tasks/today');
      const nextTasks = body.tasks || [];
      setTasks(nextTasks);
      const nextSelected = nextTasks.find((task) => task.id === preferredTaskId) || nextTasks[0] || null;
      setSelectedTaskId(nextSelected?.id || null);
      if (nextSelected) {
        await loadConversation(nextSelected.id, nextSelected);
      } else {
        setMessages([]);
        setYesterday('');
        setToday('');
      }
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadConversation(taskId, taskOverride = null) {
    const task = taskOverride || tasks.find((item) => item.id === taskId);
    if (task) {
      setYesterday(task.yesterday_text || '');
      setToday(task.today_text || '');
    }
    const body = await api(`/api/tasks/${taskId}/conversation`);
    setMessages(body.messages || []);
  }

  useEffect(() => {
    loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function selectTask(taskId) {
    setSelectedTaskId(taskId);
    setError('');
    try {
      await loadConversation(taskId);
    } catch (err) {
      setError(formatApiError(err));
    }
  }

  async function saveTask() {
    if (!selectedTask) return;
    setSaving(true);
    setError('');
    try {
      const body = await api(`/api/tasks/${selectedTask.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ yesterday_text: yesterday, today_text: today }),
      });
      setTasks((current) => current.map((task) => (task.id === body.task.id ? body.task : task)));
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setSaving(false);
    }
  }

  async function confirmTask() {
    if (!selectedTask) return;
    setSaving(true);
    setError('');
    try {
      const body = await api(`/api/tasks/${selectedTask.id}/confirm`, { method: 'POST' });
      setTasks((current) => current.map((task) => (task.id === body.task.id ? body.task : task)));
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setSaving(false);
    }
  }

  async function sendChat(message) {
    if (!selectedTask) return;
    setSending(true);
    setError('');
    try {
      const body = await api(`/api/tasks/${selectedTask.id}/conversation`, {
        method: 'POST',
        body: JSON.stringify({ message }),
      });
      setMessages((current) => [...current, ...(body.messages || [])]);
      if (body.task) {
        setTasks((current) => current.map((task) => (task.id === body.task.id ? body.task : task)));
      }
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setSending(false);
    }
  }

  const completed = selectedTask?.status === 'completed';

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Tasks</CardTitle>
            <CardDescription>Today's report queue</CardDescription>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => loadTasks(selectedTaskId)} aria-label="Refresh tasks">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="grid gap-2">
          {loading ? (
            <div className="rounded-md border border-border bg-secondary p-3 text-sm text-muted-foreground">Loading tasks</div>
          ) : tasks.length ? (
            tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                active={task.id === selectedTask?.id}
                onSelect={selectTask}
              />
            ))
          ) : (
            <div className="rounded-md border border-border bg-secondary p-3 text-sm text-muted-foreground">
              No report tasks for today.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
        {error ? (
          <div className="xl:col-span-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        {selectedTask ? (
          <>
            <TaskEditor
              task={selectedTask}
              yesterday={yesterday}
              today={today}
              setYesterday={setYesterday}
              setToday={setToday}
              onSave={saveTask}
              onConfirm={confirmTask}
              saving={saving}
            />
            <ChatPanel messages={messages} disabled={completed} onSend={sendChat} sending={sending} />
          </>
        ) : (
          <Card className="xl:col-span-2">
            <CardContent className="p-6 text-sm text-muted-foreground">
              Create daily tasks from the scheduler before reporting.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
