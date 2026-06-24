import { CheckCircle2, Save } from 'lucide-react';
import { Badge } from './ui/badge.jsx';
import { Button } from './ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card.jsx';
import { Field, Textarea } from './ui/form.jsx';

export default function TaskEditor({
  task,
  yesterday,
  today,
  setYesterday,
  setToday,
  onSave,
  onConfirm,
  saving,
}) {
  const completed = task?.status === 'completed';

  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Report</CardTitle>
          <CardDescription>{task ? `Daily update for ${task.report_date}` : 'No task selected'}</CardDescription>
        </div>
        {task ? <Badge variant={task.status}>{task.status.replace('_', ' ')}</Badge> : null}
      </CardHeader>
      <CardContent className="grid gap-4">
        <Field label="Yesterday" htmlFor="yesterday-text">
          <Textarea
            id="yesterday-text"
            value={yesterday}
            onChange={(event) => setYesterday(event.target.value)}
            disabled={completed || saving}
            placeholder="What changed since your last update?"
          />
        </Field>
        <Field label="Today" htmlFor="today-text">
          <Textarea
            id="today-text"
            value={today}
            onChange={(event) => setToday(event.target.value)}
            disabled={completed || saving}
            placeholder="What are you focusing on next?"
          />
        </Field>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" onClick={onSave} disabled={completed || saving}>
            <Save className="h-4 w-4" />
            {saving ? 'Saving' : 'Start Report'}
          </Button>
          <Button type="button" variant="secondary" onClick={onConfirm} disabled={completed || saving}>
            <CheckCircle2 className="h-4 w-4" />
            Confirm Report
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
