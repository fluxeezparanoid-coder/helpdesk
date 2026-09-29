import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import Layout from './Layout';
import AuditPage from './pages/AuditPage';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import NewTicketPage from './pages/NewTicketPage';
import TicketPage from './pages/TicketPage';
import TicketsPage from './pages/TicketsPage';
import UsersPage from './pages/UsersPage';
import './index.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: false, refetchOnWindowFocus: false } } });

function Protected({ children, roles }: { children: React.ReactElement; roles?: string[] }) {
  const { user } = useAuth();
  if (roles && !roles.includes(user!.role)) return <Navigate to="/" replace />;
  return children;
}

function Home() {
  const { isStaff } = useAuth();
  return isStaff ? <DashboardPage /> : <Navigate to="/tickets" replace />;
}

function Shell() {
  const { user, loading } = useAuth();
  if (loading) return <div className="grid h-full place-items-center font-display text-2xl italic text-ink-3">Loading…</div>;
  if (!user) return <LoginPage />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="tickets" element={<TicketsPage />} />
        <Route path="tickets/:id" element={<TicketPage />} />
        <Route path="new" element={<NewTicketPage />} />
        <Route path="users" element={<Protected roles={['admin']}><UsersPage /></Protected>} />
        <Route path="audit" element={<Protected roles={['admin']}><AuditPage /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Shell />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
