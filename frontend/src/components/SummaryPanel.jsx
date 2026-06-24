import { Link } from 'react-router-dom';
import { FileText, Wand2 } from 'lucide-react';
import MarkdownText from './MarkdownText.jsx';
import { Badge } from './ui/badge.jsx';
import { Button } from './ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card.jsx';
import { Field, Input } from './ui/form.jsx';

export default function SummaryPanel({
  team,
  date,
  summary,
  onSetDate,
  onGenerate,
  busy,
}) {
  async function submit(event) {
    event.preventDefault();
    await onGenerate();
  }

  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Summary</CardTitle>
          <CardDescription>{team ? `Generate and inspect ${team.name}` : 'Create a team first.'}</CardDescription>
        </div>
        {summary ? <Badge variant={summary.status}>{summary.status}</Badge> : null}
      </CardHeader>
      <CardContent className="grid gap-4">
        {team ? (
          <>
            <form className="grid gap-3 sm:grid-cols-[minmax(0,220px)_auto] sm:items-end" onSubmit={submit}>
              <Field label="Summary date" htmlFor="summary-date">
                <Input
                  id="summary-date"
                  type="date"
                  value={date}
                  onChange={(event) => onSetDate(event.target.value)}
                  disabled={busy}
                  required
                />
              </Field>
              <Button type="submit" disabled={busy}>
                <Wand2 className="h-4 w-4" />
                Generate Summary
              </Button>
            </form>

            {summary ? (
              <div className="grid gap-3 rounded-md border border-border bg-secondary/60 p-3">
                <MarkdownText text={summary.brief_text || summary.error_message || 'Summary is pending.'} className="text-sm leading-6" />
                {summary.full_html_path ? (
                  <div className="truncate text-xs text-muted-foreground">{summary.full_html_path}</div>
                ) : null}
                <Button asChild variant="secondary" className="w-full sm:w-fit">
                  <Link to={`/summary/${team.id}/${summary.summary_date}`}>
                    <FileText className="h-4 w-4" />
                    Open Summary
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="rounded-md border border-border bg-secondary p-3 text-sm text-muted-foreground">
                No summary for the selected date.
              </div>
            )}
          </>
        ) : (
          <div className="rounded-md border border-border bg-secondary p-3 text-sm text-muted-foreground">
            Create or select a team to generate summaries.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
