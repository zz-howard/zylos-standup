import { CalendarDays } from 'lucide-react';
import { Button } from './ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card.jsx';
import { Field, Input, Select } from './ui/form.jsx';

export default function SchedulePanel({
  team,
  month,
  schedules,
  onSetMonth,
  onSetSchedule,
  busy,
}) {
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    await onSetSchedule({
      date: data.date,
      is_workday: data.is_workday === 'true',
      reason: data.reason,
    });
    form.reset();
    form.elements.is_workday.value = 'true';
  }

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Schedule</CardTitle>
        <CardDescription>{team ? 'Set daily workday overrides.' : 'Create a team first.'}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {team ? (
          <>
            <Field label="Visible month" htmlFor="schedule-month">
              <Input
                id="schedule-month"
                type="month"
                value={month}
                onChange={(event) => onSetMonth(event.target.value)}
                disabled={busy}
              />
            </Field>

            <form className="grid gap-3" onSubmit={submit}>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
                <Field label="Date" htmlFor="schedule-date">
                  <Input id="schedule-date" name="date" type="date" required disabled={busy} />
                </Field>
                <Field label="Type" htmlFor="schedule-workday">
                  <Select id="schedule-workday" name="is_workday" defaultValue="true" disabled={busy}>
                    <option value="true">Workday</option>
                    <option value="false">Non-workday</option>
                  </Select>
                </Field>
              </div>
              <Field label="Reason" htmlFor="schedule-reason">
                <Input id="schedule-reason" name="reason" placeholder="Holiday, sprint day, travel" disabled={busy} />
              </Field>
              <Button type="submit" disabled={busy}>
                <CalendarDays className="h-4 w-4" />
                Set Override
              </Button>
            </form>

            <div className="grid gap-2">
              {schedules.length ? schedules.map((row) => (
                <div key={row.date} className="grid min-h-14 gap-1 rounded-md border border-border bg-secondary/60 p-3 sm:grid-cols-[110px_110px_minmax(0,1fr)] sm:items-center">
                  <div className="text-sm font-semibold">{row.date}</div>
                  <div className="text-sm text-muted-foreground">{row.is_workday ? 'Workday' : 'Non-workday'}</div>
                  <div className="min-w-0 truncate text-sm text-muted-foreground">{row.reason || 'No reason'}</div>
                </div>
              )) : (
                <div className="rounded-md border border-border bg-secondary p-3 text-sm text-muted-foreground">
                  No overrides for this month.
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="rounded-md border border-border bg-secondary p-3 text-sm text-muted-foreground">
            Create or select a team to manage schedule overrides.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
