import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { api, formatApiError } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Button } from '../components/ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { Field, Input, Select } from '../components/ui/form.jsx';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [teams, setTeams] = useState([]);
  const [teamId, setTeamId] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api('/api/auth/teams')
      .then((body) => {
        if (!active) return;
        const nextTeams = body.teams || [];
        setTeams(nextTeams);
        if (nextTeams[0]) setTeamId(String(nextTeams[0].id));
      })
      .catch(() => {
        if (active) setTeams([]);
      });
    return () => { active = false; };
  }, []);

  async function onSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login({ teamId, name, password });
      navigate('/report', { replace: true });
    } catch (err) {
      setError(err.message === 'invalid_credentials' ? 'Invalid credentials.' : formatApiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-8 text-foreground">
      <Card className="w-full max-w-[420px]">
        <CardHeader className="gap-3">
          <img src="/standup/logo.png" alt="Zylos" className="h-14 w-14" />
          <div>
            <CardTitle className="text-2xl">Standup</CardTitle>
            <CardDescription>Sign in with your team, name, and password.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={onSubmit}>
            {error ? (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}
            <Field label="Team" htmlFor="team-id">
              {teams.length ? (
                <Select id="team-id" value={teamId} onChange={(event) => setTeamId(event.target.value)} required>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>{team.name}</option>
                  ))}
                </Select>
              ) : (
                <Input
                  id="team-id"
                  value={teamId}
                  onChange={(event) => setTeamId(event.target.value)}
                  inputMode="numeric"
                  placeholder="Team ID"
                  required
                />
              )}
            </Field>
            <Field label="Name" htmlFor="name">
              <Input
                id="name"
                autoComplete="username"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </Field>
            <Button type="submit" disabled={loading || !teamId || !name || !password}>
              <LogIn className="h-4 w-4" />
              {loading ? 'Signing in' : 'Sign In'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
