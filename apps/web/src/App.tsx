import { AppSidebar } from '@/components/app-sidebar';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { gqlRequest } from '@/api/graphql';
import { useAuth, type PublicAuthView } from '@/hooks/use-auth';
import { buildPageTitle } from '@/lib/page-title';
import { ContentTypeEditorPage, ContentTypesPage } from '@/pages/content-types-page';
import { AssetsPage } from '@/pages/assets-page';
import { EntriesPage } from '@/pages/entries-page';
import { LoginPage } from '@/pages/login-page';
import { SitesPage } from '@/pages/sites-page';
import { ApiKeysPage } from '@/pages/api-keys-page';
import { SiteSettingsPage } from '@/pages/site-settings-page';
import { PlatformUsersPage, WorkspaceUsersPage } from '@/pages/users-page';
import { DashboardPage } from '@/pages/dashboard-page';
import { AccountSettingsPage } from '@/pages/account-settings-page';
import { AdminSettingsPage } from '@/pages/admin-settings-page';
import { EntryEditorToolbarProvider, useEntryEditorToolbarState } from '@/context/entry-editor-toolbar';
import { ArrowLeft, Eye, EyeOff, History, Loader2, Settings2, Trash2 } from 'lucide-react';
import { Fragment, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { ContentType } from '@/types/app';

function EntryToolbarHeaderActions() {
  const cfg = useEntryEditorToolbarState();
  if (!cfg) return null;
  const menu = cfg.entryActionsMenu;
  const del = cfg.deleteConfirmation;
  return (
    <>
      {del ? (
        <Dialog open={del.open} onOpenChange={del.onOpenChange}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Move entry to trash?</DialogTitle>
              <DialogDescription>
                This soft-deletes the entry. You can recover it from the entries table while “Show deleted” is enabled.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:justify-end">
              <Button type="button" variant="secondary" onClick={() => del.onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={del.onConfirm}>
                Move to trash
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {cfg.revisions ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground"
                aria-label="Revision history"
                disabled={cfg.revisions.loading}
                onClick={cfg.revisions.onOpen}
              >
                {cfg.revisions.loading ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <History className="size-4" aria-hidden />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Revision history</TooltipContent>
          </Tooltip>
        ) : null}
        {menu ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground"
                aria-label="Entry actions"
              >
                <Settings2 className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              <DropdownMenuItem
                disabled={menu.visibility.disabled}
                onSelect={menu.visibility.onToggle}
              >
                {menu.visibility.visible ? <Eye /> : <EyeOff />}
                {menu.visibility.visible ? 'Hide from site' : 'Show on site'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => {
                  menu.onRequestDelete();
                }}
              >
                <Trash2 />
                Delete entry
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : cfg.secondary.kind === 'delete' ? (
          <Button variant="outline" size="sm" type="button" onClick={cfg.secondary.onClick}>
            Delete
          </Button>
        ) : (
          <Button variant="outline" size="sm" type="button" onClick={cfg.secondary.onClick}>
            Cancel
          </Button>
        )}
        <Button type="button" size="sm" disabled={cfg.saveDisabled} onClick={cfg.onSave}>
          {cfg.isSaving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </>
  );
}

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;

  const publicAuthView: PublicAuthView =
    path === '/forgot-password'
      ? 'forgotPassword'
      : path === '/reset-password'
        ? 'resetPassword'
        : path === '/invite'
          ? 'invitePassword'
          : 'login';
  const resetToken = new URLSearchParams(location.search).get('token');

  const {
    token,
    userEmail,
    userDisplayName,
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
    mailConfigured,
    authStep,
    isSubmitting,
    isValidatingSession,
    tokenLinkStatus,
    error,
    sites,
    isAdmin,
    refreshSites,
    refreshProfile,
    handleLogin,
    handleSetInitialPassword,
    handleRequestPasswordReset,
    handleCompletePasswordWithToken,
    cancelPasswordSetup,
    handleLogout,
  } = useAuth(publicAuthView, resetToken);
  const [activeSiteId, setActiveSiteId] = useState(() => localStorage.getItem('notecms_active_site_id') ?? '');
  const [sidebarContentTypes, setSidebarContentTypes] = useState<ContentType[]>([]);

  useEffect(() => {
    if (path === '/') navigate('/dashboard', { replace: true });
  }, [path, navigate]);

  useEffect(() => {
    if (!token) return;
    if (path === '/reset-password' || path === '/invite' || path === '/forgot-password') {
      navigate('/dashboard', { replace: true });
    }
  }, [token, path, navigate]);

  useEffect(() => {
    const legacy: Record<string, string> = {
      '/sites': '/admin/sites',
      '/settings': '/admin/settings',
      '/api-keys': '/admin/api-keys',
    };
    const next = legacy[path];
    if (next) navigate(next, { replace: true });
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

  useEffect(() => {
    if (isValidatingSession) {
      document.title = buildPageTitle('Loading');
      return;
    }
    if (!token) return;
    const activeWorkspace = sites.find((site) => site.id === activeSiteId);
    const siteTitle = activeWorkspace?.name?.trim() || 'Workspace';
    if (path === '/admin/settings') {
      document.title = buildPageTitle('Admin settings', siteTitle);
    } else if (path === '/account') {
      document.title = buildPageTitle('Your account', siteTitle);
    }
  }, [isValidatingSession, token, path, sites, activeSiteId]);

  if (isValidatingSession) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-muted p-4">
        <div className="text-sm text-muted-foreground">Validating session...</div>
      </div>
    );
  }

  if (!token) {
    return (
      <LoginPage
        publicAuthView={publicAuthView}
        authStep={authStep}
        email={email}
        password={password}
        newPassword={newPassword}
        confirmPassword={confirmPassword}
        bootstrapSecret={bootstrapSecret}
        setupRequiresSecret={setupRequiresSecret}
        mailConfigured={mailConfigured}
        error={error}
        isSubmitting={isSubmitting}
        tokenLinkStatus={tokenLinkStatus}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onNewPasswordChange={setNewPassword}
        onConfirmPasswordChange={setConfirmPassword}
        onBootstrapSecretChange={setBootstrapSecret}
        onLoginSubmit={handleLogin}
        onSetPasswordSubmit={handleSetInitialPassword}
        onForgotPasswordSubmit={handleRequestPasswordReset}
        onCompleteTokenPasswordSubmit={handleCompletePasswordWithToken}
        onBackToLogin={cancelPasswordSetup}
      />
    );
  }

  const contentTypeId = path.startsWith('/content-types/') ? path.replace('/content-types/', '') : null;
  const contentRouteParts = path.startsWith('/content/') ? path.replace('/content/', '').split('/') : [];
  const contentRouteSlug = contentRouteParts[0] ?? null;
  const contentRouteEntryId = contentRouteParts[1] ?? null;
  const entriesRouteEntryId = path.startsWith('/entries/') ? path.replace('/entries/', '') : null;

  /** Entry editor (not list): show sticky header control to return to the type table. */
  const showEntriesBackToTable =
    (path.startsWith('/entries/') && Boolean(entriesRouteEntryId?.trim())) ||
    (path.startsWith('/content/') &&
      contentRouteParts.length >= 2 &&
      Boolean(contentRouteParts[1]?.trim()));
  const entriesBackToTablePath = path.startsWith('/entries/')
    ? '/entries'
    : `/content/${contentRouteParts[0] ?? ''}`;

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
    if (
      path === '/admin/sites' ||
      path === '/admin/settings' ||
      path === '/admin/api-keys' ||
      path === '/admin/users' ||
      path.startsWith('/admin/users/')
    ) {
      const tail =
        path === '/admin/sites'
          ? 'Sites'
          : path === '/admin/settings'
            ? 'Admin Settings'
            : path === '/admin/api-keys'
              ? 'API keys'
              : 'All users';
      return [
        { label: 'Admin', href: '/admin/sites' },
        { label: tail },
      ];
    }
    const singleMap: Record<string, string> = {
      '/dashboard': 'Dashboard',
      '/account': 'Your account',
      '/content-types': 'Content Types',
      '/entries': 'Entries',
      '/assets': 'Assets',
      '/site-settings': 'Site settings',
      '/users': 'Users',
    };
    return [{ label: singleMap[path] ?? 'Dashboard' }];
  })();
  const activeWorkspaceSite = sites.find((site) => site.id === activeSiteId);
  const showSiteAdminTools = activeWorkspaceSite?.role === 'owner';

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
        showPlatformUsersNav={isAdmin}
      />
      <SidebarInset className="bg-muted">
        <EntryEditorToolbarProvider>
          <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 bg-muted/95 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-muted/80 dark:bg-muted/90 dark:supports-[backdrop-filter]:bg-muted/75">
            <SidebarTrigger className="hover:bg-muted/90" />
            <Separator orientation="vertical" className="data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center" />
            {showEntriesBackToTable ? (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0"
                  type="button"
                  aria-label="Back to table"
                  title="Back to table"
                  onClick={() => navigate(entriesBackToTablePath)}
                >
                  <ArrowLeft />
                </Button>
                <Separator orientation="vertical" className="data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center" />
              </>
            ) : null}
            <Breadcrumb className="min-w-0 flex-1">
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
            <EntryToolbarHeaderActions />
          </header>

          <div className="flex flex-1 p-2 pt-0 overflow-hidden">
          {path === '/users' ? (
            <WorkspaceUsersPage
              token={token}
              sites={sites}
              workspaceSiteId={activeSiteId}
              isSiteOwner={activeWorkspaceSite?.role === 'owner'}
            />
          ) : path === '/admin/users' ? (
            isAdmin ? (
              <PlatformUsersPage
                token={token}
                sites={sites}
                workspaceSiteId={activeSiteId}
                currentUserEmail={userEmail}
              />
            ) : (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
                <p>All users is only available to platform administrators.</p>
              </div>
            )
          ) : path === '/admin/sites' ? (
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
            <SiteSettingsPage
              token={token}
              workspaceSiteId={activeSiteId}
              sites={sites}
              onSitesChanged={refreshSites}
              isGlobalAdmin={isAdmin}
            />
          ) : path === '/admin/api-keys' ? (
            <ApiKeysPage token={token} workspaceSiteId={activeSiteId} sites={sites} canManage={showSiteAdminTools} />
          ) : path === '/account' ? (
            <AccountSettingsPage
              token={token}
              userEmail={userEmail}
              userDisplayName={userDisplayName}
              sites={sites}
              workspaceSiteId={activeSiteId}
              onProfileUpdated={refreshProfile}
            />
          ) : path === '/admin/settings' ? (
            <AdminSettingsPage token={token} isGlobalAdmin={isAdmin} />
          ) : path === '/dashboard' ? (
            <DashboardPage
              token={token}
              workspaceSiteId={activeSiteId}
              sites={sites}
              showSiteAdminTools={showSiteAdminTools}
              isGlobalAdmin={isAdmin}
              userDisplayName={userDisplayName}
              userEmail={userEmail}
            />
          ) : (
            <div className="text-sm text-muted-foreground">Page under construction.</div>
          )}
          </div>
        </EntryEditorToolbarProvider>
      </SidebarInset>
    </SidebarProvider>
  );
}
