import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import Layout from './components/Layout';
import { Spinner } from './components/ui';
import type { Role } from './lib/types';
import LoginPage from './pages/Login';
import SignupPage from './pages/Signup';
import LogoutPage from './pages/Logout';
import { AccessDeniedPage, NotFoundPage } from './pages/Errors';

const DashboardPage = lazy(() => import('./pages/Dashboard'));
const MyTasksPage = lazy(() => import('./pages/MyTasks'));
const ProjectsPage = lazy(() => import('./pages/Projects'));
const ProjectPage = lazy(() => import('./pages/Project'));
const TeamPage = lazy(() => import('./pages/Team'));
const QACenterPage = lazy(() => import('./pages/QACenter'));
const ReportsPage = lazy(() => import('./pages/Reports'));
const NotificationsPage = lazy(() => import('./pages/Notifications'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const ActivityPage = lazy(() => import('./pages/Activity'));

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner label="Loading your workspace…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { hasRole } = useAuth();
  return hasRole(...roles) ? <>{children}</> : <AccessDeniedPage />;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
      <Route path="/signup" element={<PublicOnly><SignupPage /></PublicOnly>} />
      <Route path="/logout" element={<LogoutPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Lazy><DashboardPage /></Lazy>} />
        <Route path="my-tasks" element={<Lazy><MyTasksPage /></Lazy>} />
        <Route path="projects" element={<Lazy><ProjectsPage /></Lazy>} />
        <Route path="projects/:projectId" element={<Lazy><ProjectPage /></Lazy>} />
        <Route path="team" element={<Lazy><TeamPage /></Lazy>} />
        <Route path="qa" element={<RequireRole roles={['QA', 'MANAGER', 'ADMIN']}><Lazy><QACenterPage /></Lazy></RequireRole>} />
        <Route path="reports" element={<Lazy><ReportsPage /></Lazy>} />
        <Route path="notifications" element={<Lazy><NotificationsPage /></Lazy>} />
        <Route path="activity" element={<RequireRole roles={['ADMIN', 'MANAGER']}><Lazy><ActivityPage /></Lazy></RequireRole>} />
        <Route path="settings" element={<Lazy><SettingsPage /></Lazy>} />
        <Route path="forbidden" element={<AccessDeniedPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Spinner />}>{children}</Suspense>;
}
