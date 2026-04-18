import { AppSidebar } from '@/components/app-sidebar';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { gqlRequest } from '@/api/graphql';
import { useAuth } from '@/hooks/use-auth';
import { ContentTypeEditorPage, ContentTypesPage } from '@/pages/content-types-page';
import { AssetsPage } from '@/pages/assets-page';
import { EntriesPage } from '@/pages/entries-page';
import { LoginPage } from '@/pages/login-page';
import { SitesPage } from '@/pages/sites-page';
import { ApiKeysPage } from '@/pages/api-keys-page';
import { SiteSettingsPage } from '@/pages/site-settings-page';
import { UsersPage } from '@/pages/users-page';
import { Fragment, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { ContentType } from '@/types/app';

export function App() {
  const {
    token,
    userEmail,
    userName,
    email,
    password,
    setEmail,
    setPassword,
    newPassword,
    confirmPassword,
    setNewPassword,
    setConfirmPassword,
    bootstrapSecret,
    setBootstrapSecret,
    setupRequiresSecret,
    authStep,
    isSubmitting,
    isValidatingSession,
    error,
    sites,
    isAdmin,
    refreshSites,
    handleLogin,
    handleSetInitialPassword,
    cancelPasswordSetup,
    handleLogout,
  } = useAuth();
  const [activeSiteId, setActiveSiteId] = useState(() => localStorage.getItem('notecms_active_site_id') ?? '');
  const [sidebarContentTypes, setSidebarContentTypes] = useState<ContentType[]>([]);

  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;

  useEffect(() => {
    if (path === '/') navigate('/dashboard', { replace: true });
  }, [path, navigate]);

  useEffect(() => {
    if (!token) {
      setActiveSiteId('');
      localStorage.removeItem('notecms_active_site_id');
      return;
    }
    // Sites are empty while the session is loading — keep localStorage + selection intact.
    if (!sites.length) return;

    const exists = sites.some((site) => site.id === activeSiteId);
    if (!exists) {
      const next = sites[0].id;
      setActiveSiteId(next);
      localStorage.setItem('notecms_active_site_id', next);
    }
  }, [token, sites, activeSiteId]);

  /** Deep-link from Sites list: `/site-settings?site=<id>` switches workspace then strips the query. */
  useEffect(() => {
    if (!token || !sites.length) return;
    if (path !== '/site-settings') return;
    const requested = new URLSearchParams(location.search).get('site');
    if (!requested) return;
    if (!sites.some((s) => s.id === requested)) return;
    setActiveSiteId(requested);
    localStorage.setItem('notecms_active_site_id', requested);
    navigate('/site-settings', { replace: true });
  }, [token, sites, path, location.search, navigate]);

  function handleSiteChange(siteId: string) {
    setActiveSiteId(siteId);
    localStorage.setItem('notecms_active_site_id', siteId);
  }

  useEffect(() => {
    async function loadSidebarContentTypes() {
      if (!token || !activeSiteId) {
        setSidebarContentTypes([]);
        return;
      }
      try {
        const response = await gqlRequest<{ contentTypes: ContentType[] }>(
          token,
          'query($siteId:ID!){ contentTypes(siteId:$siteId){ id siteId name slug fields options } }',
          { siteId: activeSiteId },
        );
        setSidebarContentTypes(response.contentTypes);
      } catch {
        setSidebarContentTypes([]);
      }
    }
    void loadSidebarContentTypes();
  }, [token, activeSiteId]);

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
        authStep={authStep}
        email={email}
        password={password}
        newPassword={newPassword}
        confirmPassword={confirmPassword}
        bootstrapSecret={bootstrapSecret}
        setupRequiresSecret={setupRequiresSecret}
        error={error}
        isSubmitting={isSubmitting}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onNewPasswordChange={setNewPassword}
        onConfirmPasswordChange={setConfirmPassword}
        onBootstrapSecretChange={setBootstrapSecret}
        onLoginSubmit={handleLogin}
        onSetPasswordSubmit={handleSetInitialPassword}
        onBackToLogin={cancelPasswordSetup}
      />
    );
  }

  const contentTypeId = path.startsWith('/content-types/') ? path.replace('/content-types/', '') : null;
  const contentRouteParts = path.startsWith('/content/') ? path.replace('/content/', '').split('/') : [];
  const contentRouteSlug = contentRouteParts[0] ?? null;
  const contentRouteEntryId = contentRouteParts[1] ?? null;
  const entriesRouteEntryId = path.startsWith('/entries/') ? path.replace('/entries/', '') : null;

  const contentRouteType = sidebarContentTypes.find((item) => item.slug === contentRouteSlug);

  const breadcrumbs = (() => {
    if (path.startsWith('/content-types/')) {
      return [
        { label: 'Content Types', href: '/content-types' },
        { label: contentTypeId === 'new' ? 'New' : 'Edit' },
      ];
    }
    if (path.startsWith('/entries/')) {
      return [
        { label: 'Entries', href: '/entries' },
        { label: entriesRouteEntryId === 'new' ? 'New' : 'Edit' },
      ];
    }
    if (path.startsWith('/content/')) {
      const baseLabel = contentRouteType?.options?.sidebarLabel || contentRouteType?.name || 'Content';
      if (contentRouteEntryId) {
        return [
          { label: baseLabel, href: `/content/${contentRouteSlug ?? ''}` },
          { label: contentRouteEntryId === 'new' ? 'New' : 'Edit' },
        ];
      }
      return [{ label: baseLabel }];
    }
    const singleMap: Record<string, string> = {
      '/dashboard': 'Dashboard',
      '/sites': 'Sites',
      '/content-types': 'Content Types',
      '/entries': 'Entries',
      '/assets': 'Assets',
      '/site-settings': 'Site settings',
      '/users': 'Users',
      '/settings': 'Admin Settings',
      '/api-keys': 'API keys',
    };
    return [{ label: singleMap[path] ?? 'Dashboard' }];
  })();
  const activeWorkspaceSite = sites.find((site) => site.id === activeSiteId);
  const showSiteAdminTools = activeWorkspaceSite?.role === 'owner' || activeWorkspaceSite?.role === 'admin';

  const contentTypeMenuItems = sidebarContentTypes
    .filter((contentType) => contentType.options?.showInSidebar)
    .sort((a, b) => (a.options?.sidebarOrder ?? 100) - (b.options?.sidebarOrder ?? 100))
    .map((contentType) => ({
      path: `/content/${contentType.slug}`,
      title: contentType.options?.sidebarLabel || contentType.name,
    }));

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
        contentTypeMenuItems={contentTypeMenuItems}
        showSiteAdminTools={showSiteAdminTools}
      />
      <SidebarInset className="bg-muted">
        <header className="flex h-14 shrink-0 items-center gap-2 px-4">
          <SidebarTrigger className="hover:bg-muted/90" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center" />
          <Breadcrumb>
            <BreadcrumbList>
              {breadcrumbs.map((item, index) => (
                <Fragment key={`${item.label}-${index}`}>
                  {index > 0 ? <BreadcrumbSeparator /> : null}
                  <BreadcrumbItem>
                    {item.href ? (
                      <BreadcrumbLink asChild>
                        <Link to={item.href}>{item.label}</Link>
                      </BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage>{item.label}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        </header>

        <div className="flex flex-1 p-3 md:p-4">
          {path === '/users' ? (
            <UsersPage token={token} sites={sites} workspaceSiteId={activeSiteId} />
          ) : path === '/sites' ? (
            <SitesPage token={token} sites={sites} isAdmin={isAdmin} onSitesChanged={refreshSites} />
          ) : path === '/content-types' ? (
            <ContentTypesPage token={token} workspaceSiteId={activeSiteId} sites={sites} />
          ) : path.startsWith('/content-types/') ? (
            <ContentTypeEditorPage
              token={token}
              workspaceSiteId={activeSiteId}
              sites={sites}
              contentTypeId={contentTypeId}
            />
          ) : path === '/entries' || path.startsWith('/entries/') ? (
            <EntriesPage token={token} workspaceSiteId={activeSiteId} sites={sites} entryId={entriesRouteEntryId ?? undefined} />
          ) : path.startsWith('/content/') ? (
            <EntriesPage
              token={token}
              workspaceSiteId={activeSiteId}
              sites={sites}
              forcedContentTypeSlug={contentRouteSlug ?? undefined}
              entryId={contentRouteEntryId ?? undefined}
            />
          ) : path === '/assets' ? (
            <AssetsPage token={token} workspaceSiteId={activeSiteId} sites={sites} />
          ) : path === '/site-settings' ? (
            <SiteSettingsPage token={token} workspaceSiteId={activeSiteId} sites={sites} onSitesChanged={refreshSites} />
          ) : path === '/api-keys' ? (
            <ApiKeysPage token={token} workspaceSiteId={activeSiteId} sites={sites} canManage={showSiteAdminTools} />
          ) : (
            <div className="text-sm text-muted-foreground">Page under construction.</div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
