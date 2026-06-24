import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import MarkdownText from '../components/MarkdownText.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { Button } from '../components/ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { api, formatApiError } from '../lib/api.js';

export default function SummaryPage() {
  const { teamId, date } = useParams();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    setMissing(false);
    api(`/api/summaries/${teamId}/${date}`)
      .then((body) => setSummary(body.summary || null))
      .catch((err) => {
        if (err.status === 404) {
          setMissing(true);
          return;
        }
        setError(formatApiError(err));
      })
      .finally(() => setLoading(false));
  }, [teamId, date]);

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="ghost">
          <Link to="/admin">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </Button>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-md border border-border bg-secondary p-3 text-sm text-muted-foreground">Loading summary</div>
      ) : missing ? (
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
            <CardDescription>Team {teamId} / {date}</CardDescription>
          </CardHeader>
          <CardContent className="rounded-md border border-border bg-secondary p-3 text-sm text-muted-foreground">
            No summary exists for this team and date.
          </CardContent>
        </Card>
      ) : summary ? (
        <Card className="min-w-0">
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <span className="truncate">Summary</span>
              </CardTitle>
              <CardDescription>Team {teamId} / {date}</CardDescription>
            </div>
            <Badge variant={summary.status}>{summary.status}</Badge>
          </CardHeader>
          <CardContent className="grid gap-5">
            <section className="grid gap-2">
              <h2 className="text-sm font-semibold">Brief</h2>
              <div className="rounded-md border border-border bg-secondary/60 p-3 text-sm leading-6">
                <MarkdownText text={summary.brief_text || summary.error_message || 'No brief summary available.'} />
              </div>
            </section>
            <section className="grid gap-2">
              <h2 className="text-sm font-semibold">Detailed Markdown</h2>
              <div className="max-h-[62vh] overflow-auto rounded-md border border-border bg-background/70 p-4 text-sm leading-6">
                <MarkdownText text={summary.content || ''} />
              </div>
            </section>
            {summary.full_html_path ? (
              <div className="truncate rounded-md border border-border bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
                {summary.full_html_path}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
