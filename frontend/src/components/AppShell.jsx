import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ClipboardList, LogOut, Settings, Users } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { Button } from './ui/button.jsx';
import { cn } from '../lib/utils.js';

function navClass({ isActive }) {
  return cn(
    'inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
    isActive && 'bg-secondary text-foreground',
  );
}

export default function AppShell() {
  const { member, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  async function onLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  const subtitle = member ? member.display_name : 'Async reports';

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/report" className="flex min-w-0 items-center gap-3">
            <img src="/standup/logo.png" alt="Zylos" className="h-9 w-9 shrink-0" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">Zylos Standup</div>
              <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
            </div>
          </Link>
          {member ? (
            <div className="flex min-w-0 items-center gap-2">
              <nav className="flex min-w-0 items-center gap-1 overflow-x-auto">
                <NavLink to="/report" className={navClass}>
                  <ClipboardList className="h-4 w-4" />
                  <span>Report</span>
                </NavLink>
                {member.role === 'admin' ? (
                  <NavLink to="/admin" className={navClass}>
                    <Settings className="h-4 w-4" />
                    <span>Admin</span>
                  </NavLink>
                ) : null}
              </nav>
              <Button variant="ghost" size="icon" onClick={onLogout} aria-label="Logout">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-6">
        <Outlet key={location.pathname} />
      </main>
    </div>
  );
}

export function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
      <Users className="mr-2 h-4 w-4 animate-pulse text-primary" />
      Loading
    </div>
  );
}
