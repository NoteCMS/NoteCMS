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
  const [sidebarContentTypes, setSidebarContentTypes] = useState<ContentType[]>([]);

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
      '/users': 'Users',
      '/settings': 'Settings',
    };
    return [{ label: singleMap[path] ?? 'Dashboard' }];
  })();
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
      />
      <SidebarInset className="bg-muted">
        <header className="flex h-14 shrink-0 items-center gap-2 px-4">
          <SidebarTrigger />
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

        <div className="flex flex-1 p-6">
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
          ) : (
            <div className="text-sm text-muted-foreground">Page under construction.</div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
