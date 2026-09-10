import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import AppShell from './components/layout/AppShell.jsx';
import LoginPage from './pages/LoginPage.jsx';
import HomePage from './pages/HomePage.jsx';
import { Spinner } from './components/ui/index.jsx';

const ScreeningPage = lazy(() => import('./pages/ScreeningPage.jsx'));
const HistoryPage = lazy(() => import('./pages/HistoryPage.jsx'));
const ScreeningDetailPage = lazy(() => import('./pages/ScreeningDetailPage.jsx'));
const InvestigationsPage = lazy(() => import('./pages/InvestigationsPage.jsx'));
const ReportsPage = lazy(() => import('./pages/ReportsPage.jsx'));
const AdminPage = lazy(() => import('./pages/AdminPage.jsx'));
const SettingsPage = lazy(() => import('./pages/SettingsPage.jsx'));

const Loading = () => <div className="flex min-h-[50vh] items-center justify-center"><Spinner className="h-6 w-6" /></div>;

function RequireAuth({ children, admin = false }) {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();
  if (loading) return <div className="flex min-h-dvh items-center justify-center"><Spinner className="h-6 w-6" /></div>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (admin && !isAdmin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth><AppShell /></RequireAuth>}>
          <Route index element={<HomePage />} />
          <Route path="screen" element={<ScreeningPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="history/:id" element={<ScreeningDetailPage />} />
          <Route path="investigations" element={<InvestigationsPage />} />
          <Route path="investigations/:id" element={<ScreeningDetailPage investigation />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="admin" element={<RequireAuth admin><AdminPage /></RequireAuth>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
