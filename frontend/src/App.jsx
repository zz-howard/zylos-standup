import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom';
import AppShell, { LoadingScreen } from './components/AppShell.jsx';
import { AuthProvider, useAuth } from './lib/auth.jsx';
import AdminPage from './pages/AdminPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ReportPage from './pages/ReportPage.jsx';

function Placeholder({ title }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 text-card-foreground">
      <h1 className="text-lg font-semibold">{title}</h1>
    </div>
  );
}

function RequireAuth({ children, admin = false }) {
  const { member, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!member) return <Navigate to="/login" replace />;
  if (admin && member.role !== 'admin') return <Navigate to="/report" replace />;
  return children;
}

function LoginRedirect() {
  const { member, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (member) return <Navigate to="/report" replace />;
  return <LoginPage />;
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/report" replace />,
  },
  {
    path: '/login',
    element: <LoginRedirect />,
  },
  {
    element: <RequireAuth><AppShell /></RequireAuth>,
    children: [
      { path: '/report', element: <ReportPage /> },
      { path: '/admin', element: <RequireAuth admin><AdminPage /></RequireAuth> },
      { path: '/summary/:teamId/:date', element: <Placeholder title="Summary" /> },
    ],
  },
], { basename: '/standup' });

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
