import { AppSidebar } from '@/components/app-sidebar';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { useAuth } from '@/hooks/use-auth';
import { ContentTypesPage } from '@/pages/content-types-page';
import { EntriesPage } from '@/pages/entries-page';
import { LoginPage } from '@/pages/login-page';
import { SitesPage } from '@/pages/sites-page';
import { UsersPage } from '@/pages/users-page';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export function App() {
  const {
    token,
    userEmail,
    userName,
    email,
    password,
    setEmail,
    setPassword,
    isSubmitting,
    isValidatingSession,
    error,
    sites,
    isAdmin,
    refreshSites,
    handleLogin,
    handleLogout,
  } = useAuth();
  const [activeSiteId, setActiveSiteId] = useState(() => localStorage.getItem('notecms_active_site_id') ?? '');

  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;

  useEffect(() => {
    if (path === '/') navigate('/dashboard', { replace: true });
  }, [path, navigate]);

  useEffect(() => {
    if (!sites.length) {
      setActiveSiteId('');
      localStorage.removeItem('notecms_active_site_id');
      return;
    }
    const exists = sites.some((site) => site.id === activeSiteId);
    if (!exists) {
      const next = sites[0].id;
      setActiveSiteId(next);
      localStorage.setItem('notecms_active_site_id', next);
    }
  }, [sites, activeSiteId]);

  function handleSiteChange(siteId: string) {
    setActiveSiteId(siteId);
    localStorage.setItem('notecms_active_site_id', siteId);
  }

  if (isValidatingSession) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background p-4">
        <div className="text-sm text-muted-foreground">Validating session...</div>
      </div>
    );
  }

  if (!token) {
    return (
      <LoginPage
        email={email}
        password={password}
        error={error}
        isSubmitting={isSubmitting}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onSubmit={handleLogin}
      />
    );
  }

  const titleMap: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/sites': 'Sites',
    '/content-types': 'Content Types',
    '/entries': 'Entries',
    '/users': 'Users',
    '/settings': 'Settings',
  };
  const title = titleMap[path] ?? 'Dashboard';

  return (
    <SidebarProvider>
      <AppSidebar
        userName={userName}
        userEmail={userEmail}
        sites={sites}
        activeSiteId={activeSiteId}
        onSiteChange={handleSiteChange}
        onLogout={() => {
          handleLogout();
          navigate('/dashboard');
        }}
        activePath={path}
        onNavigate={navigate}
      />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <h1 className="text-sm font-medium">{title}</h1>
        </header>

        <div className="flex flex-1 p-6">
          {path === '/users' ? (
            <UsersPage token={token} sites={sites} workspaceSiteId={activeSiteId} />
          ) : path === '/sites' ? (
            <SitesPage token={token} sites={sites} isAdmin={isAdmin} onSitesChanged={refreshSites} />
          ) : path === '/content-types' ? (
            <ContentTypesPage workspaceSiteId={activeSiteId} sites={sites} />
          ) : path === '/entries' ? (
            <EntriesPage workspaceSiteId={activeSiteId} sites={sites} />
          ) : (
            <div className="text-sm text-muted-foreground">Page under construction.</div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
