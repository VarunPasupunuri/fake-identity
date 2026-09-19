import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import AppShell from './components/layout/AppShell.jsx';
import LoginPage from './pages/LoginPage.jsx';
import HomePage from './pages/HomePage.jsx';
import { Spinner } from './components/ui/index.jsx';

const PublicShell = lazy(() => import('./components/public/PublicShell.jsx'));
const PublicHomePage = lazy(() => import('./pages/public/HomePage.jsx'));
const AboutPage = lazy(() => import('./pages/public/AboutPage.jsx'));
const HowItWorksPage = lazy(() => import('./pages/public/HowItWorksPage.jsx'));
const FeaturesPage = lazy(() => import('./pages/public/FeaturesPage.jsx'));
const SupportedDocumentsPage = lazy(() => import('./pages/public/SupportedDocumentsPage.jsx'));
const SecurityPage = lazy(() => import('./pages/public/SecurityPage.jsx'));
const FaqPage = lazy(() => import('./pages/public/FaqPage.jsx'));
const ContactPage = lazy(() => import('./pages/public/ContactPage.jsx'));

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
  if (admin && !isAdmin) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        {/* Public site. Reachable without signing in; the console lives under /dashboard. */}
        <Route element={<PublicShell />}>
          <Route index element={<PublicHomePage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="how-it-works" element={<HowItWorksPage />} />
          <Route path="features" element={<FeaturesPage />} />
          <Route path="supported-documents" element={<SupportedDocumentsPage />} />
          <Route path="security" element={<SecurityPage />} />
          <Route path="faq" element={<FaqPage />} />
          <Route path="contact" element={<ContactPage />} />
        </Route>

        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth><AppShell /></RequireAuth>}>
          <Route path="dashboard" element={<HomePage />} />
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
