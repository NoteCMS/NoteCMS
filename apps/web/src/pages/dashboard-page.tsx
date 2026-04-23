import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  Globe,
  Image,
  KeyRound,
  LayoutGrid,
  Loader2,
  RefreshCw,
  Settings,
  Shapes,
  Users,
} from 'lucide-react';
import { gqlRequest } from '@/api/graphql';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { Skeleton } from '@/components/ui/skeleton';
import { buildPageTitle, useDocumentTitle } from '@/lib/page-title';
import type { ContentType, Site } from '@/types/app';

type EntryListRow = {
  id: string;
  name: string;
  contentTypeId: string;
  updatedAt: string;
  lastEditedBy: { email: string } | null;
};

type WorkspaceOverview = {
  contentTypeCount: number;
  entryCount: number;
  assetCount: number;
  memberCount: number;
  siteTitle: string | null;
  lastEntryActivity: string | null;
  byContentType: Array<{
    contentTypeId: string;
    name: string;
    slug: string;
    entryCount: number;
  }>;
};

type DashboardPageProps = {
  token: string;
  workspaceSiteId: string;
  sites: Site[];
  /** Site owner/admin: API keys, integration hints */
  showSiteAdminTools: boolean;
  isGlobalAdmin: boolean;
};

function siteUrlHref(url: string): string {
  const t = url.trim();
  if (!t) return '#';
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function formatRelativeUpdated(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function initialsFromEmail(email: string): string {
  const local = email.split('@')[0]?.trim() ?? '';
  if (!local) return '?';
  const segments = local.split(/[._\s-]+/).filter(Boolean);
  if (segments.length >= 2) {
    const a = segments[0]?.[0];
    const b = segments[1]?.[0];
    if (a && b) return `${a}${b}`.toUpperCase();
  }
  return local.slice(0, 2).toUpperCase();
}

export function DashboardPage({
  token,
  workspaceSiteId,
  sites,
  showSiteAdminTools,
  isGlobalAdmin,
}: DashboardPageProps) {
  const activeSite = sites.find((s) => s.id === workspaceSiteId);
  const siteTitle = activeSite?.name?.trim() || 'Workspace';

  useDocumentTitle(buildPageTitle('Dashboard', siteTitle));

  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [recentEntries, setRecentEntries] = useState<
    (EntryListRow & { contentTypeName: string; contentTypeSlug: string })[]
  >([]);
  const [mcpEnabled, setMcpEnabled] = useState<boolean | null>(null);
  const [apiKeyCount, setApiKeyCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!token || !workspaceSiteId) {
      setContentTypes([]);
      setOverview(null);
      setRecentEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [mainRes, keysRes] = await Promise.all([
        gqlRequest<{
          workspaceOverview: WorkspaceOverview;
          contentTypes: ContentType[];
          siteSettings: { mcpEnabled: boolean };
        }>(
          token,
          `query($siteId:ID!){
            workspaceOverview(siteId:$siteId) {
              contentTypeCount
              entryCount
              assetCount
              memberCount
              siteTitle
              lastEntryActivity
              byContentType { contentTypeId name slug entryCount }
            }
            contentTypes(siteId:$siteId){ id siteId name slug fields options }
            siteSettings(siteId:$siteId){ mcpEnabled }
          }`,
          { siteId: workspaceSiteId },
        ),
        showSiteAdminTools
          ? gqlRequest<{ apiKeys: { id: string }[] }>(
              token,
              'query($siteId:ID!){ apiKeys(siteId:$siteId){ id } }',
              { siteId: workspaceSiteId },
            ).catch(() => ({ apiKeys: [] as { id: string }[] }))
          : Promise.resolve(null),
      ]);

      const types = mainRes.contentTypes;
      setContentTypes(types);
      setOverview(mainRes.workspaceOverview);
      setMcpEnabled(mainRes.siteSettings?.mcpEnabled ?? null);
      setApiKeyCount(keysRes?.apiKeys?.length ?? null);

      const entryChunks = await Promise.all(
        types.map((t) =>
          gqlRequest<{ entries: EntryListRow[] }>(
            token,
            'query($siteId:ID!,$contentTypeId:ID!){ entries(siteId:$siteId,contentTypeId:$contentTypeId,limit:8,offset:0){ id name contentTypeId updatedAt lastEditedBy { email } } }',
            { siteId: workspaceSiteId, contentTypeId: t.id },
          ).catch(() => ({ entries: [] as EntryListRow[] })),
        ),
      );

      const merged: (EntryListRow & { contentTypeName: string; contentTypeSlug: string })[] = [];
      for (let i = 0; i < types.length; i += 1) {
        const t = types[i]!;
        for (const e of entryChunks[i]?.entries ?? []) {
          merged.push({
            ...e,
            contentTypeName: t.name,
            contentTypeSlug: t.slug,
          });
        }
      }
      merged.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setRecentEntries(merged.slice(0, 14));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard');
      setContentTypes([]);
      setOverview(null);
      setRecentEntries([]);
    } finally {
      setLoading(false);
    }
  }, [token, workspaceSiteId, showSiteAdminTools]);

  useEffect(() => {
    void load();
  }, [load]);

  const roleLabel = activeSite?.role ? activeSite.role.charAt(0).toUpperCase() + activeSite.role.slice(1) : 'Member';

  const canCreateEntries =
    activeSite?.role === 'owner' || activeSite?.role === 'admin' || activeSite?.role === 'editor';

  const firstSidebarType = useMemo(
    () =>
      contentTypes
        .filter((c) => c.options?.showInSidebar)
        .sort((a, b) => (a.options?.sidebarOrder ?? 100) - (b.options?.sidebarOrder ?? 100))[0],
    [contentTypes],
  );

  const showAdminCard = showSiteAdminTools || isGlobalAdmin;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border/80 bg-card lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="text-xl font-semibold tracking-tight">{siteTitle}</CardTitle>
                {overview?.siteTitle && overview.siteTitle !== siteTitle ? (
                  <p className="text-sm text-muted-foreground">
                    Public title: <span className="text-foreground">{overview.siteTitle}</span>
                  </p>
                ) : null}
                <CardDescription className="flex flex-wrap items-center gap-2">
                  {activeSite?.url ? (
                    <a
                      href={siteUrlHref(activeSite.url)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {activeSite.url.replace(/^https?:\/\//i, '')}
                    </a>
                  ) : (
                    <span>No URL set</span>
                  )}
                </CardDescription>
              </div>
              <Badge variant="secondary">{roleLabel}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-xl" />
                  ))}
                </div>
                <Skeleton className="h-20 w-full rounded-xl" />
              </div>
            ) : overview ? (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
                    <p className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">{overview.entryCount}</p>
                    <p className="text-xs font-medium text-muted-foreground">Entries</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
                    <p className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">{overview.contentTypeCount}</p>
                    <p className="text-xs font-medium text-muted-foreground">Content types</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
                    <p className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">{overview.assetCount}</p>
                    <p className="text-xs font-medium text-muted-foreground">Assets</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
                    <p className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">{overview.memberCount}</p>
                    <p className="text-xs font-medium text-muted-foreground">Members</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {overview.lastEntryActivity ? (
                      <>
                        Last entry activity{' '}
                        <span className="font-medium text-foreground">{formatRelativeUpdated(overview.lastEntryActivity)}</span>
                      </>
                    ) : (
                      'No entries in this workspace yet'
                    )}
                  </span>
                  <Button variant="link" className="h-auto p-0 text-xs" asChild>
                    <Link to="/entries">Browse all entries</Link>
                  </Button>
                </div>
                <Separator />
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">By content type</p>
                  {overview.byContentType.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No content types yet — create one to start publishing.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {overview.byContentType.map((row) => (
                        <Button key={row.contentTypeId} variant="secondary" size="sm" className="h-8 gap-1.5 font-normal" asChild>
                          <Link to={`/content/${row.slug}`}>
                            <span>{row.name}</span>
                            <Badge variant="outline" className="tabular-nums font-normal">
                              {row.entryCount}
                            </Badge>
                          </Link>
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Quick actions</CardTitle>
            <CardDescription>Common tasks for this site</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {canCreateEntries ? (
              <>
                <Button variant="outline" className="justify-start gap-2" asChild>
                  <Link to="/entries/new">
                    <FileText className="size-4 shrink-0" />
                    New entry
                  </Link>
                </Button>
                {firstSidebarType ? (
                  <Button variant="outline" className="justify-start gap-2" asChild>
                    <Link to={`/content/${firstSidebarType.slug}/new`}>
                      <FileText className="size-4 shrink-0" />
                      New {firstSidebarType.options?.sidebarLabel || firstSidebarType.name}
                    </Link>
                  </Button>
                ) : null}
              </>
            ) : (
              <p className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                Viewers can browse entries and assets; ask an editor or admin to create new content.
              </p>
            )}
            <Button variant="outline" className="justify-start gap-2" asChild>
              <Link to="/content-types">
                <Shapes className="size-4 shrink-0" />
                Content types
              </Link>
            </Button>
            <Button variant="outline" className="justify-start gap-2" asChild>
              <Link to="/entries">
                <LayoutGrid className="size-4 shrink-0" />
                All entries
              </Link>
            </Button>
            <Button variant="outline" className="justify-start gap-2" asChild>
              <Link to="/assets">
                <Image className="size-4 shrink-0" />
                Assets
              </Link>
            </Button>
            <Button variant="outline" className="justify-start gap-2" asChild>
              <Link to="/site-settings">
                <Settings className="size-4 shrink-0" />
                Site settings
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/80 bg-card">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Recent activity</CardTitle>
            <CardDescription>Latest updates across all types in this workspace</CardDescription>
          </div>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-2xl" />
              ))}
            </div>
          ) : recentEntries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/80 bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
              <p className="mb-3">No entries yet. Create a content type, then add your first entry.</p>
              <Button asChild size="sm">
                <Link to="/content-types">Content types</Link>
              </Button>
            </div>
          ) : (
            <ItemGroup className="gap-2">
              {recentEntries.map((entry) => (
                <Item key={entry.id} variant="outline" size="sm" asChild>
                  <Link to={`/content/${entry.contentTypeSlug}/${entry.id}`}>
                    <ItemMedia variant="icon">
                      <Avatar className="size-8">
                        <AvatarFallback className="text-xs">
                          {initialsFromEmail(entry.lastEditedBy?.email ?? entry.name)}
                        </AvatarFallback>
                      </Avatar>
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{entry.name || 'Untitled'}</ItemTitle>
                      <ItemDescription>
                        {entry.contentTypeName}
                        {entry.lastEditedBy?.email ? ` · ${entry.lastEditedBy.email}` : ''}
                        {' · '}
                        {formatRelativeUpdated(entry.updatedAt)}
                      </ItemDescription>
                    </ItemContent>
                  </Link>
                </Item>
              ))}
            </ItemGroup>
          )}
        </CardContent>
      </Card>

      {showAdminCard ? (
        <Card className="border-border/80 bg-card">
          <CardHeader>
            <CardTitle className="text-base">Admin &amp; integrations</CardTitle>
            <CardDescription>Tools that affect access, automation, or the whole platform</CardDescription>
          </CardHeader>
          <CardContent>
            <ItemGroup className="gap-2">
              {showSiteAdminTools ? (
                <>
                  <Item variant="outline" size="sm" asChild>
                    <Link to="/api-keys">
                      <ItemMedia variant="icon">
                        <KeyRound className="size-4 text-muted-foreground" />
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle>API keys</ItemTitle>
                        <ItemDescription>
                          {apiKeyCount !== null ? (
                            <>
                              <strong className="text-foreground">{apiKeyCount}</strong> active key
                              {apiKeyCount === 1 ? '' : 's'}
                            </>
                          ) : (
                            'Scoped tokens for scripts and MCP clients'
                          )}
                        </ItemDescription>
                      </ItemContent>
                    </Link>
                  </Item>
                  <Item variant="outline" size="sm" asChild>
                    <Link to="/site-settings">
                      <ItemMedia variant="icon">
                        <Settings className="size-4 text-muted-foreground" />
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle>MCP for this site</ItemTitle>
                        <ItemDescription>
                          {mcpEnabled === null
                            ? 'Open site settings to manage the MCP endpoint'
                            : mcpEnabled
                              ? 'MCP is enabled — agents can use tools when authenticated'
                              : 'MCP is off — enable it in Site settings if you use AI agents'}
                        </ItemDescription>
                      </ItemContent>
                    </Link>
                  </Item>
                </>
              ) : null}
              <Item variant="outline" size="sm" asChild>
                <Link to="/users">
                  <ItemMedia variant="icon">
                    <Users className="size-4 text-muted-foreground" />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>Users &amp; roles</ItemTitle>
                    <ItemDescription>Who can access this workspace and what they can do</ItemDescription>
                  </ItemContent>
                </Link>
              </Item>
              {isGlobalAdmin ? (
                <Item variant="outline" size="sm" asChild>
                  <Link to="/sites">
                    <ItemMedia variant="icon">
                      <Globe className="size-4 text-muted-foreground" />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>All sites</ItemTitle>
                      <ItemDescription>Create sites and manage platform-level access</ItemDescription>
                    </ItemContent>
                  </Link>
                </Item>
              ) : null}
            </ItemGroup>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
