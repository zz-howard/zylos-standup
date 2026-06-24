import { useEffect, useMemo, useState } from 'react';
import MemberPanel from '../components/MemberPanel.jsx';
import SchedulePanel from '../components/SchedulePanel.jsx';
import SummaryPanel from '../components/SummaryPanel.jsx';
import TeamPanel from '../components/TeamPanel.jsx';
import { api, formatApiError } from '../lib/api.js';

const today = new Date().toISOString().slice(0, 10);
const currentMonth = today.slice(0, 7);

export default function AdminPage() {
  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [members, setMembers] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [scheduleMonth, setScheduleMonth] = useState(currentMonth);
  const [summaryDate, setSummaryDate] = useState(today);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const selectedTeam = useMemo(
    () => teams.find((team) => team.id === selectedTeamId) || teams[0] || null,
    [teams, selectedTeamId],
  );

  async function loadTeams(preferredTeamId = selectedTeamId) {
    const body = await api('/api/teams');
    const nextTeams = body.teams || [];
    const nextSelected = nextTeams.find((team) => team.id === preferredTeamId) || nextTeams[0] || null;
    setTeams(nextTeams);
    setSelectedTeamId(nextSelected?.id || null);
    return nextSelected;
  }

  async function loadTeamDetails(teamId, month = scheduleMonth, date = summaryDate) {
    if (!teamId) {
      setMembers([]);
      setSchedules([]);
      setSummary(null);
      return;
    }
    const [memberBody, scheduleBody, summaryBody] = await Promise.all([
      api(`/api/teams/${teamId}/members`),
      api(`/api/teams/${teamId}/schedule?month=${month}`),
      api(`/api/summaries/${teamId}/${date}`).catch((err) => {
        if (err.status === 404) return { summary: null };
        throw err;
      }),
    ]);
    setMembers(memberBody.members || []);
    setSchedules(scheduleBody.schedules || []);
    setSummary(summaryBody.summary || null);
  }

  async function refresh(preferredTeamId = selectedTeamId) {
    setError('');
    const team = await loadTeams(preferredTeamId);
    await loadTeamDetails(team?.id || null);
  }

  useEffect(() => {
    setLoading(true);
    refresh()
      .catch((err) => setError(formatApiError(err)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function withBusy(action) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function selectTeam(teamId) {
    setSelectedTeamId(teamId);
    await withBusy(() => loadTeamDetails(teamId));
  }

  async function createTeam(payload) {
    await withBusy(async () => {
      const body = await api('/api/teams', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await refresh(body.team.id);
    });
  }

  async function addMember(payload) {
    if (!selectedTeam) return;
    await withBusy(async () => {
      await api(`/api/teams/${selectedTeam.id}/members`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await loadTeamDetails(selectedTeam.id);
    });
  }

  async function removeMember(memberId) {
    if (!selectedTeam) return;
    await withBusy(async () => {
      await api(`/api/teams/${selectedTeam.id}/members/${memberId}`, { method: 'DELETE' });
      await loadTeamDetails(selectedTeam.id);
    });
  }

  async function setSchedule(payload) {
    if (!selectedTeam) return;
    await withBusy(async () => {
      await api(`/api/teams/${selectedTeam.id}/schedule/${payload.date}`, {
        method: 'PUT',
        body: JSON.stringify({
          is_workday: payload.is_workday,
          reason: payload.reason,
        }),
      });
      await loadTeamDetails(selectedTeam.id);
    });
  }

  async function updateScheduleMonth(month) {
    setScheduleMonth(month);
    if (!selectedTeam) return;
    await withBusy(() => loadTeamDetails(selectedTeam.id, month));
  }

  async function updateSummaryDate(date) {
    setSummaryDate(date);
    if (!selectedTeam) return;
    await withBusy(() => loadTeamDetails(selectedTeam.id, scheduleMonth, date));
  }

  async function generateSummary() {
    if (!selectedTeam) return;
    await withBusy(async () => {
      const body = await api('/api/summaries/generate', {
        method: 'POST',
        body: JSON.stringify({ team_id: selectedTeam.id, date: summaryDate }),
      });
      setSummary(body.summary || null);
    });
  }

  return (
    <div className="grid gap-4">
      {error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-md border border-border bg-secondary p-3 text-sm text-muted-foreground">Loading admin data</div>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-3">
            <TeamPanel
              teams={teams}
              selectedTeamId={selectedTeam?.id || null}
              onSelectTeam={selectTeam}
              onCreateTeam={createTeam}
              busy={busy}
            />
            <MemberPanel
              team={selectedTeam}
              members={members}
              onAddMember={addMember}
              onRemoveMember={removeMember}
              busy={busy}
            />
            <SchedulePanel
              team={selectedTeam}
              month={scheduleMonth}
              schedules={schedules}
              onSetMonth={updateScheduleMonth}
              onSetSchedule={setSchedule}
              busy={busy}
            />
          </div>
          <SummaryPanel
            team={selectedTeam}
            date={summaryDate}
            summary={summary}
            onSetDate={updateSummaryDate}
            onGenerate={generateSummary}
            busy={busy}
          />
        </>
      )}
    </div>
  );
}
