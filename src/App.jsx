import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import AppShell from './components/layout/AppShell.jsx';
import LoginPage from './pages/LoginPage.jsx';
import HomePage from './pages/HomePage.jsx';
import ScreeningPage from './pages/ScreeningPage.jsx';
import HistoryPage from './pages/HistoryPage.jsx';
import ScreeningDetailPage from './pages/ScreeningDetailPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import { Spinner } from './components/ui/index.jsx';

function RequireAuth({ children, admin = false }) {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();
  if (loading) return <div className="flex min-h-dvh items-center justify-center"><Spinner className="h-8 w-8" /></div>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (admin && !isAdmin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<HomePage />} />
        <Route path="screen" element={<ScreeningPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="history/:id" element={<ScreeningDetailPage />} />
        <Route path="admin" element={<RequireAuth admin><AdminPage /></RequireAuth>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
