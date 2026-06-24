const app = document.getElementById('app');

const state = {
  member: null,
  tasks: [],
  selectedTaskId: null,
  conversation: [],
  teams: [],
  members: [],
  schedules: [],
  summary: null,
  summaryDate: new Date().toISOString().slice(0, 10),
  error: '',
};

const externalPrefix = location.pathname.startsWith('/standup') ? '/standup' : '';
const apiUrl = (path) => `${externalPrefix}${path}`;

function localPath() {
  const path = location.pathname.replace(/^\/standup/, '') || '/';
  return path === '/' ? '/report' : path;
}

function routeTo(path) {
  history.pushState(null, '', `${externalPrefix}${path}`);
  render();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderMd(value) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

async function api(path, options = {}) {
  const res = await fetch(apiUrl(path), {
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });
  if (res.status === 401) {
    state.member = null;
    if (localPath() !== '/login') routeTo('/login');
    throw new Error('unauthorized');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `request_failed_${res.status}`);
  return body;
}

function shell(content, active = '') {
  const member = state.member;
  const adminLink = member?.role === 'admin'
    ? `<a href="${externalPrefix}/admin" data-nav="/admin" class="${active === 'admin' ? 'active' : ''}">Admin</a>`
    : '';
  return `
    <header class="topbar">
      <div class="brand">
        <img src="./_assets/logo.png" alt="Zylos">
        <div><strong>Zylos Standup</strong><span>${member ? escapeHtml(member.display_name) : 'Async reports'}</span></div>
      </div>
      <nav class="nav">
        <a href="${externalPrefix}/report" data-nav="/report" class="${active === 'report' ? 'active' : ''}">Report</a>
        ${adminLink}
        <button class="ghost" data-action="logout">Logout</button>
      </nav>
    </header>
    <main class="page">${content}</main>
  `;
}

function bindShell() {
  app.querySelectorAll('[data-nav]').forEach(link => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      routeTo(link.dataset.nav);
    });
  });
  app.querySelector('[data-action="logout"]')?.addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => null);
    state.member = null;
    routeTo('/login');
  });
}

async function ensureSession() {
  if (state.member) return true;
  try {
    const body = await api('/api/auth/me');
    state.member = body.member;
    return true;
  } catch {
    return false;
  }
}

async function loadTeamsForLogin() {
  try {
    const body = await fetch(apiUrl('/api/auth/teams'), { credentials: 'same-origin' });
    if (!body.ok) return [];
    return (await body.json()).teams || [];
  } catch {
    return [];
  }
}

async function renderLogin() {
  const teams = await loadTeamsForLogin();
  app.innerHTML = `
    <main class="login-page">
      <form class="login-box stack" data-form="login">
        <img src="./_assets/logo.png" alt="Zylos">
        <div>
          <h1>Standup</h1>
          <p class="muted">Sign in with your team, name, and password.</p>
        </div>
        ${state.error ? `<div class="error">${escapeHtml(state.error)}</div>` : ''}
        <div class="form-row">
          <label for="team-id">Team</label>
          ${teams.length ? `
            <select id="team-id" name="team_id">
              ${teams.map(team => `<option value="${team.id}">${escapeHtml(team.name)}</option>`).join('')}
            </select>
          ` : '<input id="team-id" name="team_id" inputmode="numeric" placeholder="Team ID" required>'}
        </div>
        <div class="form-row"><label for="name">Name</label><input id="name" name="name" autocomplete="username" required></div>
        <div class="form-row"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required></div>
        <button class="primary" type="submit">Sign In</button>
      </form>
    </main>
  `;
  app.querySelector('[data-form="login"]').addEventListener('submit', async (event) => {
    event.preventDefault();
    state.error = '';
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const body = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          team_id: Number(data.team_id),
          name: data.name,
          password: data.password,
        }),
      });
      state.member = body.member;
      routeTo('/report');
    } catch (err) {
      state.error = err.message === 'invalid_credentials' ? 'Invalid credentials.' : err.message;
      renderLogin();
    }
  });
}

function taskBadge(status) {
  if (status === 'completed') return '<span class="badge done">Completed</span>';
  if (status === 'in_progress') return '<span class="badge ready">In progress</span>';
  return '<span class="badge">Pending</span>';
}

async function loadReport() {
  const body = await api('/api/tasks/today');
  state.tasks = body.tasks || [];
  if (!state.selectedTaskId && state.tasks[0]) state.selectedTaskId = state.tasks[0].id;
  const selected = state.tasks.find(task => task.id === state.selectedTaskId);
  if (selected) {
    const convo = await api(`/api/tasks/${selected.id}/conversation`);
    state.conversation = convo.messages || [];
  }
}

function renderReportPage() {
  const selected = state.tasks.find(task => task.id === state.selectedTaskId);
  const taskList = state.tasks.length ? state.tasks.map(task => `
    <article class="task-card ${task.id === state.selectedTaskId ? 'active' : ''}" data-task="${task.id}">
      <div class="task-head">
        <div><strong>${escapeHtml(task.report_date)}</strong><div class="muted">Task #${task.id}</div></div>
        ${taskBadge(task.status)}
      </div>
      <div class="muted">${renderMd(task.ai_summary || 'No summary yet.')}</div>
    </article>
  `).join('') : '<div class="empty">No report tasks for today.</div>';

  const editor = selected ? `
    <section class="panel stack">
      <div class="section-title"><h2>Report</h2>${taskBadge(selected.status)}</div>
      <div class="grid two">
        <div class="stack">
          <div class="form-row"><label>Yesterday</label><textarea id="yesterday">${escapeHtml(selected.yesterday_text || '')}</textarea></div>
          <div class="form-row"><label>Today</label><textarea id="today">${escapeHtml(selected.today_text || '')}</textarea></div>
          <div class="actions">
            <button class="primary" data-action="save-task" ${selected.status === 'completed' ? 'disabled' : ''}>Start Report</button>
            <button data-action="confirm-task" ${selected.status === 'completed' ? 'disabled' : ''}>Confirm Report</button>
          </div>
        </div>
        <div class="chat">
          <div class="messages">
            ${state.conversation.length ? state.conversation.map(row => `
              <div class="message ${row.role}">
                <div class="role">${row.role}</div>
                <div>${renderMd(row.content)}</div>
              </div>
            `).join('') : '<div class="empty">No chat yet.</div>'}
          </div>
          <form class="actions" data-form="chat">
            <input name="message" placeholder="Send an update or answer a follow-up" ${selected.status === 'completed' ? 'disabled' : ''}>
            <button type="submit" ${selected.status === 'completed' ? 'disabled' : ''}>Send</button>
          </form>
        </div>
      </div>
    </section>
  ` : '<section class="panel empty">Create today tasks from the scheduler before reporting.</section>';

  app.innerHTML = shell(`
    <div class="report-grid">
      <section class="stack">
        <div class="section-title"><h1>Today</h1><button data-action="refresh">Refresh</button></div>
        ${taskList}
      </section>
      ${editor}
    </div>
  `, 'report');
  bindShell();
  app.querySelectorAll('[data-task]').forEach(card => {
    card.addEventListener('click', () => {
      state.selectedTaskId = Number(card.dataset.task);
      render();
    });
  });
  app.querySelector('[data-action="refresh"]')?.addEventListener('click', render);
  app.querySelector('[data-action="save-task"]')?.addEventListener('click', async () => {
    await api(`/api/tasks/${selected.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        yesterday_text: app.querySelector('#yesterday').value,
        today_text: app.querySelector('#today').value,
      }),
    });
    render();
  });
  app.querySelector('[data-action="confirm-task"]')?.addEventListener('click', async () => {
    await api(`/api/tasks/${selected.id}/confirm`, { method: 'POST' });
    render();
  });
  app.querySelector('[data-form="chat"]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = event.currentTarget.elements.message;
    if (!input.value.trim()) return;
    await api(`/api/tasks/${selected.id}/conversation`, {
      method: 'POST',
      body: JSON.stringify({ message: input.value }),
    });
    input.value = '';
    render();
  });
}

async function renderReport() {
  await loadReport();
  renderReportPage();
}

async function loadAdmin() {
  const body = await api('/api/teams');
  state.teams = body.teams || [];
  const selectedTeam = state.teams[0];
  state.summary = null;
  if (selectedTeam) {
    state.members = (await api(`/api/teams/${selectedTeam.id}/members`)).members || [];
    const month = new Date().toISOString().slice(0, 7);
    state.schedules = (await api(`/api/teams/${selectedTeam.id}/schedule?month=${month}`)).schedules || [];
    state.summary = await api(`/api/summaries/${selectedTeam.id}/${state.summaryDate}`)
      .then(body => body.summary)
      .catch(() => null);
  }
}

function renderAdminPage() {
  const team = state.teams[0];
  const summaryLink = team && state.summary
    ? `<button data-nav="/summary/${team.id}/${state.summary.summary_date}">Open Summary</button>`
    : '';
  app.innerHTML = shell(`
    <div class="grid three">
      <section class="panel stack">
        <div class="section-title"><h2>Teams</h2></div>
        <form class="stack" data-form="team">
          <input name="name" placeholder="Team name" required>
          <input name="timezone" placeholder="Timezone" value="Asia/Singapore">
          <button class="primary">Create Team</button>
        </form>
        <table class="table"><tbody>${state.teams.map(row => `<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.timezone)}</td></tr>`).join('')}</tbody></table>
      </section>
      <section class="panel stack">
        <div class="section-title"><h2>Members</h2></div>
        ${team ? `
          <form class="stack" data-form="member">
            <input name="username" placeholder="Username" required>
            <input name="display_name" placeholder="Display name" required>
            <input name="password" type="password" placeholder="Initial password" required>
            <select name="role"><option value="member">Member</option><option value="admin">Admin</option></select>
            <button class="primary">Add Member</button>
          </form>
          <table class="table"><tbody>${state.members.map(row => `
            <tr><td>${escapeHtml(row.display_name)}</td><td>${escapeHtml(row.role)}</td><td><button class="danger" data-remove-member="${row.id}">Remove</button></td></tr>
          `).join('')}</tbody></table>
        ` : '<div class="empty">Create a team first.</div>'}
      </section>
      <section class="panel stack">
        <div class="section-title"><h2>Schedule</h2></div>
        ${team ? `
          <form class="stack" data-form="schedule">
            <input name="date" type="date" required>
            <select name="is_workday"><option value="true">Workday</option><option value="false">Non-workday</option></select>
            <input name="reason" placeholder="Reason">
            <button class="primary">Set Override</button>
          </form>
          <table class="table"><tbody>${state.schedules.map(row => `
            <tr><td>${escapeHtml(row.date)}</td><td>${row.is_workday ? 'Workday' : 'Off'}</td><td>${escapeHtml(row.reason || '')}</td></tr>
          `).join('')}</tbody></table>
        ` : '<div class="empty">Create a team first.</div>'}
      </section>
    </div>
    <section class="panel stack" style="margin-top:16px">
      <div class="section-title"><h2>Summary</h2>${summaryLink}</div>
      ${team ? `
        <form class="actions" data-form="summary">
          <input name="date" type="date" value="${escapeHtml(state.summaryDate)}" required>
          <button class="primary">Generate Summary</button>
        </form>
        ${state.summary ? `
          <div class="summary-body">${renderMd(state.summary.brief_text || state.summary.error_message || 'Summary is pending.')}</div>
          <div class="muted">${escapeHtml(state.summary.full_html_path || '')}</div>
        ` : '<div class="empty">No summary for the selected date.</div>'}
      ` : '<div class="empty">Create a team first.</div>'}
    </section>
  `, 'admin');
  bindShell();
  app.querySelector('[data-form="team"]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    await api('/api/teams', { method: 'POST', body: JSON.stringify(data) });
    render();
  });
  app.querySelector('[data-form="member"]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    await api(`/api/teams/${team.id}/members`, { method: 'POST', body: JSON.stringify(data) });
    render();
  });
  app.querySelectorAll('[data-remove-member]').forEach(button => {
    button.addEventListener('click', async () => {
      await api(`/api/teams/${team.id}/members/${button.dataset.removeMember}`, { method: 'DELETE' });
      render();
    });
  });
  app.querySelector('[data-form="schedule"]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    await api(`/api/teams/${team.id}/schedule/${data.date}`, {
      method: 'PUT',
      body: JSON.stringify({
        is_workday: data.is_workday === 'true',
        reason: data.reason,
      }),
    });
    render();
  });
  app.querySelector('[data-form="summary"]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    state.summaryDate = data.date;
    const body = await api('/api/summaries/generate', {
      method: 'POST',
      body: JSON.stringify({ team_id: team.id, date: data.date }),
    });
    state.summary = body.summary;
    renderAdminPage();
  });
}

async function renderAdmin() {
  await loadAdmin();
  renderAdminPage();
}

async function renderSummary() {
  const [, , team, date] = localPath().split('/');
  const body = await api(`/api/summaries/${team}/${date}`).catch((err) => {
    if (err.message === 'summary_not_found') return { summary: null };
    throw err;
  });
  const summary = body.summary;
  if (!summary) {
    app.innerHTML = shell(`
      <section class="panel stack">
        <div class="section-title"><h1>Summary</h1><span class="badge">Missing</span></div>
        <div class="muted">Team ${escapeHtml(team || '')} / ${escapeHtml(date || '')}</div>
        <div class="empty">No summary exists for this team and date.</div>
      </section>
    `, '');
    bindShell();
    return;
  }
  app.innerHTML = shell(`
    <section class="panel stack">
      <div class="section-title"><h1>Summary</h1><span class="badge ${summary.status === 'ready' ? 'done' : ''}">${escapeHtml(summary.status)}</span></div>
      <div class="muted">Team ${escapeHtml(team || '')} / ${escapeHtml(date || '')}</div>
      <section class="stack">
        <h2>Brief</h2>
        <div class="summary-body">${renderMd(summary.brief_text || summary.error_message || 'No brief summary available.')}</div>
      </section>
      <section class="stack">
        <h2>Detailed Markdown</h2>
        <div class="summary-body">${renderMd(summary.content || '')}</div>
      </section>
      ${summary.full_html_path ? `<div class="muted">${escapeHtml(summary.full_html_path)}</div>` : ''}
    </section>
  `, '');
  bindShell();
}

async function render() {
  state.error = '';
  const path = localPath();
  if (path === '/login') return renderLogin();
  const ok = await ensureSession();
  if (!ok) return renderLogin();
  try {
    if (path === '/admin') return renderAdmin();
    if (path.startsWith('/summary/')) return renderSummary();
    return renderReport();
  } catch (err) {
    app.innerHTML = shell(`<div class="error">${escapeHtml(err.message)}</div>`, '');
    bindShell();
  }
}

window.addEventListener('popstate', render);
document.addEventListener('DOMContentLoaded', render);
