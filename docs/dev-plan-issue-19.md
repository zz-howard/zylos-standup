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

*\* Non-admin users can only access summaries for their own team (team_id must match). Admins can access any team's summaries.*

### Vite Dev Proxy

`vite.config.js` proxies `/api/*` to `http://127.0.0.1:3475` during development. Production serves from `dist/` via Express.

### Asset URL Contract

Vite build uses `base: '/standup/'`. Built `index.html` references assets as `/standup/assets/index-xxxx.js`, `/standup/assets/index-xxxx.css`.

Why `/standup/` and not `/`: Caddy only routes `/standup/*` to this service (strip-prefix). A browser-absolute `/assets/...` request would bypass the Caddy route entirely and 404. Assets must be under `/standup/` to reach this service.

Express serves `dist/assets/` at two mount points:
- `app.use('/assets', express.static('dist/assets'))` — Caddy strips `/standup` prefix, so `/standup/assets/x.js` arrives as `/assets/x.js`
- `app.use('/standup/assets', express.static('dist/assets'))` — for direct local access at `127.0.0.1:3475/standup/assets/...`

SPA fallback: all non-API, non-asset GET requests return `dist/index.html`.

React Router basename: always `/standup` (matches both Caddy-proxied and direct access).

Browser acceptance must test via the real `https://host/standup/...` URL, not Express root routes.

## Development Checklist

### Phase 1: Project Setup
- [ ] Initialize Vite + React project in `frontend/`
- [ ] Install and configure Tailwind CSS
- [ ] Install and configure shadcn/ui (dark theme)
- [ ] Configure Vite dev proxy to Express API (port 3475)
- [ ] Set up `vite.config.js` with `base: '/standup/'` and build output to `../dist/`
- [ ] Add `npm run dev` and `npm run build` scripts to root `package.json`

### Phase 2: Core Infrastructure
- [ ] Create `api.js` fetch wrapper (credentials: same-origin, 401 redirect, JSON parsing)
- [ ] Create auth context provider (session state, login/logout, /api/auth/me check)
- [ ] Create `AppShell.jsx` (header with logo, nav links, logout button, responsive)
- [ ] Set up React Router with fixed basename `/standup`
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
- [ ] Modify `.gitignore`: remove `dist/` line (or add `!dist/` exception) so built output can be committed
- [ ] Run `npm run build` to produce `dist/`
- [ ] Modify `src/lib/frontend.js`: serve `dist/` at both `/` and `/standup/` paths; dual-mount `dist/assets/` at `/assets/` and `/standup/assets/`; SPA fallback returns `dist/index.html` for non-API routes
- [ ] Ensure logo.png is included in build (copy to `frontend/public/`)
- [ ] Remove old `assets/standup.css` and `assets/standup.js`
- [ ] Keep `assets/logo.png` as source (copied into `frontend/public/` for build)
- [ ] Commit `dist/` to repo (verify `git status` shows `dist/` tracked, not ignored)
- [ ] Update `frontend.test.js`: assert `dist/index.html` exists and is served; parse its `<script>`/`<link>` tags to extract asset URLs (expected `/standup/assets/...`); assert those assets resolve 200 via both Express paths: stripped (`/assets/...`) and direct (`/standup/assets/...`); assert SPA fallback returns index.html for `/report`, `/standup/report`, `/summary/1/2026-06-25`, `/standup/summary/1/2026-06-25`
- [ ] Verify `zylos add standup` installs correctly (pre-built dist/ included)

### Phase 8: Polish & Responsive Verification
- [ ] Verify all API integrations match current behavior
- [ ] Test dark theme consistency across all pages
- [ ] Check loading states and error handling
- [ ] Browser viewport matrix test (using `agent-browser` at acceptance):
  - Viewports: 375x812 (mobile), 768x1024 (tablet), 1280x800 (desktop)
  - Each page: assert `document.documentElement.scrollWidth <= window.innerWidth` (no horizontal overflow)
  - Each page: assert core controls are visible and not clipped (login fields+button, report textarea+chat+confirm, admin panels+forms, summary content)
  - Collect screenshots at each viewport as evidence
  - Assert zero console errors
- [ ] End-to-end flow: login -> report -> admin -> summary -> logout

## Test Checklist

### Existing Tests (must still pass)
- [ ] `npm test` — all existing tests pass (record actual count from output, don't hardcode)
- [ ] `frontend.test.js` — rewrite to assert: `dist/index.html` served at all route patterns; referenced JS/CSS assets resolve 200 from multiple route depths (see Phase 7)

### Browser Viewport Matrix (at acceptance, using agent-browser)
- [ ] Viewports: 375x812 (mobile), 768x1024 (tablet), 1280x800 (desktop)
- [ ] Login page: form centered, all fields visible, Sign In button clickable — each viewport
- [ ] Report page desktop: sidebar + editor + chat side by side, no overflow
- [ ] Report page mobile: stacked layout, all sections scrollable, no horizontal overflow
- [ ] Admin page desktop: 3 panels side by side
- [ ] Admin page mobile: panels stacked, forms usable
- [ ] Summary detail page: content readable at all viewports
- [ ] Each viewport: `document.documentElement.scrollWidth <= window.innerWidth`
- [ ] Each viewport: zero console errors
- [ ] Screenshots collected as evidence for each viewport x page combination

### Functional Testing
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
- [ ] **Caddy strip-prefix behavior unchanged** — requests arrive at Express without `/standup` prefix; React Router handles both cases via basename detection
- [ ] **Asset URLs resolve from all route depths** — Vite `base: '/standup/'` produces `/standup/assets/...` paths; Caddy routes `/standup/*` to Express (strip-prefix), so `/standup/assets/x.js` arrives as `/assets/x.js`; Express dual-mounts at `/assets/` and `/standup/assets/`; `frontend.test.js` asserts assets 200 from both stripped (`/assets/...`) and direct (`/standup/assets/...`) paths
- [ ] **`.gitignore` must be modified** — current `.gitignore` blocks `dist/`; Phase 7 explicitly removes this rule before committing build output
- [ ] **logo.png can be served from dist/** — copy to `frontend/public/logo.png`; Vite includes public/ files in build output
- [ ] **devDependencies only** — Vite, React, Tailwind, shadcn/ui are devDependencies (build-time only); production only needs the built dist/ files and existing backend dependencies

## Acceptance Checklist

- [ ] All 4 pages render correctly on desktop (1280px) — browser screenshots, no horizontal overflow
- [ ] All 4 pages render correctly on mobile (375px) — browser screenshots, no horizontal overflow
- [ ] All 4 pages render correctly on tablet (768px) — browser screenshots, no horizontal overflow
- [ ] `scrollWidth <= innerWidth` assertion passes at all 3 viewports for all pages
- [ ] Zero console errors at all viewports
- [ ] Login flow: select team, enter credentials, sign in, redirected to report
- [ ] Report flow: view tasks, edit report, send chat message, confirm report
- [ ] Admin flow: create team, add member, set schedule, generate summary
- [ ] Summary detail: accessible from admin, displays brief + detailed content
- [ ] API integration identical to current frontend (no backend changes)
- [ ] Dark theme consistent with Zylos design language
- [ ] `npm test` — all existing tests pass (record actual count)
- [ ] `npm run build` produces `dist/` successfully
- [ ] `dist/` committed (not blocked by `.gitignore`), deployable via `zylos upgrade standup`
- [ ] `frontend.test.js` passes: `dist/index.html` served, referenced assets resolve 200 from all route patterns
- [ ] Visual comparison: clear improvement over vanilla version
- [ ] Logout works, session expiry redirects to login
