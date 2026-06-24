import { Plus, Users } from 'lucide-react';
import { Button } from './ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card.jsx';
import { Field, Input } from './ui/form.jsx';
import { cn } from '../lib/utils.js';

export default function TeamPanel({
  teams,
  selectedTeamId,
  onSelectTeam,
  onCreateTeam,
  busy,
}) {
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    await onCreateTeam({
      name: data.name,
      timezone: data.timezone || 'Asia/Singapore',
    });
    form.reset();
    form.elements.timezone.value = 'Asia/Singapore';
  }

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Teams</CardTitle>
        <CardDescription>Create teams and choose the active admin target.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form className="grid gap-3" onSubmit={submit}>
          <Field label="Team name" htmlFor="team-name">
            <Input id="team-name" name="name" required placeholder="Engineering" disabled={busy} />
          </Field>
          <Field label="Timezone" htmlFor="team-timezone">
            <Input id="team-timezone" name="timezone" defaultValue="Asia/Singapore" disabled={busy} />
          </Field>
          <Button type="submit" disabled={busy}>
            <Plus className="h-4 w-4" />
            Create Team
          </Button>
        </form>

        <div className="grid gap-2">
          {teams.length ? teams.map((team) => (
            <button
              key={team.id}
              type="button"
              onClick={() => onSelectTeam(team.id)}
              className={cn(
                'grid min-h-16 w-full gap-1 rounded-md border p-3 text-left transition-colors',
                team.id === selectedTeamId
                  ? 'border-primary/60 bg-primary/10'
                  : 'border-border bg-secondary/60 hover:bg-secondary',
              )}
            >
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold">{team.name}</span>
                <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
              </div>
              <span className="truncate text-xs text-muted-foreground">{team.timezone}</span>
            </button>
          )) : (
            <div className="rounded-md border border-border bg-secondary p-3 text-sm text-muted-foreground">
              No teams yet.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
