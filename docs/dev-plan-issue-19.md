# Dev Plan: Rewrite Frontend with React + shadcn/ui (#19)

## Summary

Replace the vanilla JS frontend with React + Vite + Tailwind CSS + shadcn/ui to achieve a polished, mobile-responsive UI. Backend API is unchanged; only the frontend rendering layer is rewritten.

## Scope

**In scope:**
- React SPA with 4 views: Login, Report, Admin, Summary detail
- Full mobile responsive layout (all breakpoints)
- Dark theme matching Zylos design language (current color palette as reference)
- Vite build outputting to `dist/` (committed to repo)
- Express backend serves `dist/` instead of `assets/`
- Dev proxy from Vite to Express API

**Out of scope:**
- Backend API changes (all 19 endpoints stay identical)
- New features or functionality
- Authentication flow changes (same cookie-based session)
- Light theme (dark only, matching current)

## Architecture

```
zylos-standup/
  frontend/              # NEW: React + Vite project
    src/
      main.jsx           # Entry point
      App.jsx            # Router + auth context
      lib/
        api.js           # Fetch wrapper (same contract as current)
      pages/
        LoginPage.jsx
        ReportPage.jsx
        AdminPage.jsx
        SummaryPage.jsx
      components/
        AppShell.jsx     # Header + nav + layout wrapper
        TaskCard.jsx
        ChatPanel.jsx
        TaskEditor.jsx
        TeamPanel.jsx
        MemberPanel.jsx
        SchedulePanel.jsx
        SummaryPanel.jsx
    index.html
    vite.config.js
    tailwind.config.js
    postcss.config.js
    components.json      # shadcn/ui config
  dist/                  # NEW: Vite build output (committed)
  assets/                # KEEP: logo.png stays, CSS/JS removed after migration
  src/lib/frontend.js    # MODIFY: serve dist/ instead of assets/
```

### API Contract (no changes)

| Method | Endpoint | Auth | Admin |
|--------|----------|------|-------|
| GET | `/api/health` | No | No |
| GET | `/api/auth/teams` | No | No |
| POST | `/api/auth/login` | No | No |
| POST | `/api/auth/logout` | Yes | No |
| GET | `/api/auth/me` | Yes | No |
| GET | `/api/tasks/today?date=` | Yes | No |
| PATCH | `/api/tasks/:id` | Yes | No |
| POST | `/api/tasks/:id/confirm` | Yes | No |
| GET | `/api/tasks/:id/conversation` | Yes | No |
| POST | `/api/tasks/:id/conversation` | Yes | No |
| GET | `/api/teams` | Yes | Yes |
| POST | `/api/teams` | Yes | Yes |
| GET | `/api/teams/:id/members?active=` | Yes | Yes |
| POST | `/api/teams/:id/members` | Yes | Yes |
| DELETE | `/api/teams/:id/members/:mid` | Yes | Yes |
| GET | `/api/teams/:id/schedule?month=` | Yes | Yes |
| PUT | `/api/teams/:id/schedule/:date` | Yes | Yes |
| POST | `/api/summaries/generate` | Yes | Yes |
| GET | `/api/summaries/:team_id/:date` | Yes | No* |

### Vite Dev Proxy

`vite.config.js` proxies `/api/*` to `http://127.0.0.1:3475` during development. Production serves from `dist/` via Express.

### Path Handling

Current frontend detects `/standup` prefix for Caddy reverse proxy. React app must handle the same:
- Caddy strips `/standup` prefix, so the app receives requests at `/`
- Direct access at `/standup/...` must also work (Express routes both)
- Use `basename` in React Router, derived from `window.location.pathname`

## Development Checklist

### Phase 1: Project Setup
- [ ] Initialize Vite + React project in `frontend/`
- [ ] Install and configure Tailwind CSS
- [ ] Install and configure shadcn/ui (dark theme)
- [ ] Configure Vite dev proxy to Express API (port 3475)
- [ ] Set up `vite.config.js` with `base: './'` and build output to `../dist/`
- [ ] Add `npm run dev` and `npm run build` scripts to root `package.json`

### Phase 2: Core Infrastructure
- [ ] Create `api.js` fetch wrapper (credentials: same-origin, 401 redirect, JSON parsing)
- [ ] Create auth context provider (session state, login/logout, /api/auth/me check)
- [ ] Create `AppShell.jsx` (header with logo, nav links, logout button, responsive)
- [ ] Set up React Router with basename detection for `/standup` prefix
- [ ] Add route guards (redirect to login when unauthorized)

### Phase 3: Login Page
- [ ] Login form with Team selector, Username, Password fields
- [ ] Load teams from `/api/auth/teams` for dropdown
- [ ] Error display for invalid credentials
- [ ] Mobile responsive layout (centered card)

### Phase 4: Report Page
- [ ] Task list sidebar (left on desktop, top on mobile)
- [ ] Task cards with date, task number, status badge, AI summary
- [ ] Report editor form (Yesterday/Today textareas)
- [ ] AI chat panel with message bubbles (user/assistant styling)
- [ ] Chat input with send button
- [ ] Start Report / Confirm Report actions
- [ ] Markdown rendering in summaries and chat messages (bold, newlines)
- [ ] Disabled state for completed tasks

### Phase 5: Admin Page
- [ ] Teams panel: create team form + teams table
- [ ] Members panel: add member form + members table with remove button
- [ ] Schedule panel: date override form + schedule table
- [ ] Summary panel: date picker + generate button + summary display
- [ ] Only visible to admin role users
- [ ] Responsive: 3 columns on desktop, stacked on mobile

### Phase 6: Summary Detail Page
- [ ] Route: `/summary/:teamId/:date`
- [ ] Display brief text and detailed markdown content
- [ ] Status badge
- [ ] Back navigation

### Phase 7: Build & Integration
- [ ] Run `npm run build` to produce `dist/`
- [ ] Modify `src/lib/frontend.js` to serve `dist/` with cache-busting
- [ ] Ensure logo.png is included in build (copy to `frontend/public/`)
- [ ] Remove old `assets/standup.css` and `assets/standup.js`
- [ ] Keep `assets/logo.png` as source (copied into `frontend/public/` for build)
- [ ] Commit `dist/` to repo
- [ ] Verify `zylos add standup` installs correctly (pre-built dist/ included)
- [ ] Update `frontend.test.js` if route patterns changed

### Phase 8: Polish
- [ ] Verify all API integrations match current behavior
- [ ] Test dark theme consistency across all pages
- [ ] Verify mobile responsive on all 4 views
- [ ] Check loading states and error handling
- [ ] Browser test: login -> report -> admin -> summary flow

## Test Checklist

### Existing Tests (must still pass)
- [ ] `npm test` — all 33 tests pass (backend unchanged)
- [ ] `frontend.test.js` — update if static path changes from `assets/` to `dist/`

### Manual Browser Testing
- [ ] Login page: desktop + mobile (320px, 768px, 1280px)
- [ ] Report page: desktop layout (sidebar + editor + chat)
- [ ] Report page: mobile layout (stacked, scrollable)
- [ ] Admin page: 3-column desktop, stacked mobile
- [ ] Summary detail page: desktop + mobile
- [ ] Navigation: Report <-> Admin links, Logout
- [ ] Chat: send message, receive AI response, scroll
- [ ] Task: save report, confirm report
- [ ] Admin: create team, add member, remove member, set schedule override
- [ ] Admin: generate summary, view summary detail
- [ ] Error states: invalid login, API failure
- [ ] Completed task: all inputs and buttons disabled

### Integration Verification
- [ ] `/api/auth/teams` loads team dropdown on login
- [ ] `/api/auth/login` creates session, `/api/auth/me` validates it
- [ ] `/api/tasks/today` loads today's tasks
- [ ] `/api/tasks/:id/conversation` loads and sends chat messages
- [ ] `/api/summaries/generate` triggers AI summary
- [ ] Session expiry redirects to login

## Assumptions

- [ ] **Vite build works with Node 20+** — Vite 6 requires Node 18+, confirmed compatible
- [ ] **shadcn/ui dark theme** — shadcn/ui supports dark mode via CSS class strategy; we set dark as default/only theme
- [ ] **dist/ size is reasonable for git** — React + shadcn/ui bundle is typically 200-400KB gzipped; acceptable for repo
- [ ] **Caddy strip-prefix behavior unchanged** — requests arrive at Express without `/standup` prefix; React Router handles both cases via basename
- [ ] **Express static middleware for dist/** — `express.static()` serves the built SPA; all non-API routes fall through to `index.html` for client-side routing
- [ ] **logo.png can be served from dist/** — copy to `frontend/public/logo.png`; Vite includes public/ files in build output
- [ ] **devDependencies only** — Vite, React, Tailwind, shadcn/ui are devDependencies (build-time only); production only needs the built dist/ files and existing backend dependencies

## Acceptance Checklist

- [ ] All 4 pages render correctly on desktop (1280px+) — browser screenshots
- [ ] All 4 pages render correctly on mobile (375px) — browser screenshots
- [ ] Login flow: select team, enter credentials, sign in, redirected to report
- [ ] Report flow: view tasks, edit report, send chat message, confirm report
- [ ] Admin flow: create team, add member, set schedule, generate summary
- [ ] Summary detail: accessible from admin, displays brief + detailed content
- [ ] API integration identical to current frontend (no backend changes)
- [ ] Dark theme consistent with Zylos design language
- [ ] `npm test` — all existing tests pass
- [ ] `npm run build` produces `dist/` successfully
- [ ] `dist/` committed, deployable via `zylos upgrade standup`
- [ ] Visual comparison: clear improvement over vanilla version
- [ ] Logout works, session expiry redirects to login
- [ ] No console errors in browser
