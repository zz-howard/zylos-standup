import { Trash2, UserPlus } from 'lucide-react';
import { Badge } from './ui/badge.jsx';
import { Button } from './ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card.jsx';
import { Field, Input, Select } from './ui/form.jsx';

export default function MemberPanel({
  team,
  members,
  onAddMember,
  onRemoveMember,
  busy,
}) {
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    await onAddMember(data);
    form.reset();
    form.elements.role.value = 'member';
  }

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Members</CardTitle>
        <CardDescription>{team ? `Manage ${team.name}` : 'Create a team first.'}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {team ? (
          <>
            <form className="grid gap-3" onSubmit={submit}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Username" htmlFor="member-username">
                  <Input id="member-username" name="username" autoComplete="username" required disabled={busy} />
                </Field>
                <Field label="Display name" htmlFor="member-display-name">
                  <Input id="member-display-name" name="display_name" required disabled={busy} />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_130px]">
                <Field label="Initial password" htmlFor="member-password">
                  <Input id="member-password" name="password" type="password" autoComplete="new-password" required disabled={busy} />
                </Field>
                <Field label="Role" htmlFor="member-role">
                  <Select id="member-role" name="role" defaultValue="member" disabled={busy}>
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </Select>
                </Field>
              </div>
              <Button type="submit" disabled={busy}>
                <UserPlus className="h-4 w-4" />
                Add Member
              </Button>
            </form>

            <div className="grid gap-2">
              {members.length ? members.map((member) => (
                <div key={member.id} className="flex min-h-14 items-center justify-between gap-3 rounded-md border border-border bg-secondary/60 p-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{member.display_name}</div>
                    <div className="truncate text-xs text-muted-foreground">{member.username}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={member.role === 'admin' ? 'ready' : 'pending'}>{member.role}</Badge>
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      onClick={() => onRemoveMember(member.id)}
                      disabled={busy}
                      aria-label={`Remove ${member.display_name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )) : (
                <div className="rounded-md border border-border bg-secondary p-3 text-sm text-muted-foreground">
                  No active members.
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="rounded-md border border-border bg-secondary p-3 text-sm text-muted-foreground">
            Create or select a team to manage members.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
