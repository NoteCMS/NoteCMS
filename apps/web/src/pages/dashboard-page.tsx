import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock,
  ExternalLink,
  Globe,
  Image,
  KeyRound,
  LayoutGrid,
  Loader2,
  Plus,
  RefreshCw,
  Settings,
  Shapes,
  Users,
} from 'lucide-react';
import { gqlRequest } from '@/api/graphql';
import { LoadErrorAlert } from '@/components/load-error-alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
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
  lifecycleStatus?: string;
  hasUnpublishedChanges?: boolean;
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
  showSiteAdminTools: boolean;
  isGlobalAdmin: boolean;
  userDisplayName?: string | null;
  userEmail?: string | null;
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
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function getGreeting(name?: string | null): string {
  const hr = new Date().getHours();
  const userName = name?.split(' ')[0]?.trim() || 'Bram';
  if (hr < 12) return `Good morning, ${userName}`;
  if (hr < 18) return `Good afternoon, ${userName}`;
  return `Good evening, ${userName}`;
}

export function DashboardPage({
  token,
  workspaceSiteId,
  sites,
  showSiteAdminTools,
  isGlobalAdmin,
  userDisplayName,
  userEmail,
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
            'query($siteId:ID!,$contentTypeId:ID!){ entries(siteId:$siteId,contentTypeId:$contentTypeId,limit:5,offset:0){ id name contentTypeId updatedAt lastEditedBy { email } lifecycleStatus hasUnpublishedChanges } }',
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
      setRecentEntries(merged.slice(0, 5));
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

  const isOwner = activeSite?.role === 'owner';
  const canCreateEntries = isOwner || activeSite?.role === 'editor';
  const liveSiteUrl = activeSite?.url?.trim() ?? '';

  const sidebarContentTypes = useMemo(
    () =>
      contentTypes
        .filter((c) => c.options?.showInSidebar)
        .sort((a, b) => (a.options?.sidebarOrder ?? 100) - (b.options?.sidebarOrder ?? 100)),
    [contentTypes],
  );

  const primaryCreate = useMemo(() => {
    if (sidebarContentTypes[0]) {
      const type = sidebarContentTypes[0];
      return {
        label: type.options?.sidebarLabel?.trim() || type.name,
        to: `/content/${type.slug}/new`,
      };
    }
    return { label: 'entry', to: '/entries/new' };
  }, [sidebarContentTypes]);

  const contentTypeLinks = useMemo(() => {
    const fromOverview = overview?.byContentType ?? [];
    if (fromOverview.length > 0) {
      return [...fromOverview].sort((a, b) => b.entryCount - a.entryCount);
    }
    return contentTypes.map((t) => ({
      contentTypeId: t.id,
      name: t.name,
      slug: t.slug,
      entryCount: 0,
    }));
  }, [overview?.byContentType, contentTypes]);

  const showAdminCard = showSiteAdminTools || isGlobalAdmin;

  return (
    <div className="w-full space-y-6">
      {error ? (
        <LoadErrorAlert title="Dashboard couldn't load" message={error} onRetry={() => void load()} />
      ) : null}

      {/* Greeting & Header Section */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between py-1 px-1">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {getGreeting(userDisplayName || userEmail)}
          </h1>
          <p className="text-sm text-muted-foreground">
            Welcome back to your workspace. Here is an overview of your content and activity.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {liveSiteUrl ? (
            <Button variant="outline" size="sm" className="h-9 gap-1.5" asChild>
              <a href={siteUrlHref(liveSiteUrl)} target="_blank" rel="noreferrer">
                <Globe className="size-4" />
                <span>Visit website</span>
                <ExternalLink className="size-3 opacity-60" />
              </a>
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          </Button>
        </div>
      </div>

      {/* Main Grid: Evenly Spaced 3-Column Layout */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Column 1: Recently Updated (1 Unit Wide) */}
        <Card className="border-border bg-card shadow-sm flex flex-col">
          <CardHeader className="pb-3 shrink-0">
            <CardTitle className="text-base font-semibold">Recently updated</CardTitle>
            <CardDescription>Pick up where you left off</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 pb-6">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-xl" />
                ))}
              </div>
            ) : recentEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/20 py-12 text-center h-full">
                <Clock className="size-8 text-muted-foreground/60 mb-2" />
                <p className="text-sm text-muted-foreground mb-4">No content has been created yet.</p>
                {canCreateEntries && (
                  <Button size="sm" asChild>
                    <Link to={primaryCreate.to}>
                      <Plus className="size-4 mr-1.5" /> New {primaryCreate.label}
                    </Link>
                  </Button>
                )}
              </div>
            ) : (
              <ItemGroup className="gap-2.5">
                {recentEntries.map((entry) => {
                  const isLive = entry.lifecycleStatus === 'published';
                  const hasEdits = isLive && entry.hasUnpublishedChanges;

                  return (
                    <Item key={entry.id} variant="outline" size="xs" asChild>
                      <Link to={`/content/${entry.contentTypeSlug}/${entry.id}`} className="hover:bg-muted/40 transition-colors">
                        <ItemContent className="flex-row items-center justify-between gap-3 w-full">
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center gap-2">
                              <ItemTitle className="text-sm font-medium text-foreground truncate max-w-[120px] sm:max-w-full">
                                {entry.name || 'Untitled'}
                              </ItemTitle>
                              <Badge variant="outline" className="text-[9px] font-normal font-mono px-1 py-0 shrink-0">
                                {entry.contentTypeName}
                              </Badge>
                            </div>
                            <ItemDescription className="text-[11px] text-muted-foreground truncate">
                              {formatRelativeUpdated(entry.updatedAt)}
                            </ItemDescription>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {hasEdits ? (
                              <Badge variant="secondary" className="bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 text-[9px] px-1 py-0">
                                Edits
                              </Badge>
                            ) : isLive ? (
                              <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 text-[9px] px-1 py-0">
                                Live
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[9px] px-1 py-0">
                                Draft
                              </Badge>
                            )}
                          </div>
                        </ItemContent>
                      </Link>
                    </Item>
                  );
                })}
              </ItemGroup>
            )}
          </CardContent>
        </Card>

        {/* Column 2: Content Creation & Content Lists */}
        <div className="space-y-6">
          {canCreateEntries && sidebarContentTypes.length > 0 && (
            <Card className="border-border bg-card shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Create content</CardTitle>
                <CardDescription>Start a new draft</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                {sidebarContentTypes.map((type) => (
                  <Button
                    key={type.id}
                    variant="outline"
                    className="h-10 justify-start gap-2.5 w-full font-normal hover:bg-muted"
                    asChild
                  >
                    <Link to={`/content/${type.slug}/new`}>
                      <Plus className="size-4 text-muted-foreground" />
                      <span>New {type.options?.sidebarLabel || type.name}</span>
                    </Link>
                  </Button>
                ))}
              </CardContent>
            </Card>
          )}

          {!loading && contentTypeLinks.length > 0 && (
            <Card className="border-border bg-card shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Content lists</CardTitle>
                <CardDescription>Browse entries by section</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-1.5">
                {contentTypeLinks.map((row) => (
                  <Button
                    key={row.contentTypeId}
                    variant="outline"
                    className="h-10 justify-between w-full px-3 font-normal"
                    asChild
                  >
                    <Link to={`/content/${row.slug}`}>
                      <span className="truncate">{row.name}</span>
                      <Badge variant="secondary" className="shrink-0 tabular-nums font-normal text-xs h-5 min-w-5 px-1 flex items-center justify-center">
                        {row.entryCount}
                      </Badge>
                    </Link>
                  </Button>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Column 3: Stats Summary, Quick Links & Administration */}
        <div className="space-y-6">
          {/* Overview Stats (Compact Single Unit Card) */}
          <Card className="border-border bg-card shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Overview</CardTitle>
              <CardDescription>Workspace counters</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2.5 pb-5">
              <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-muted/20 p-2 text-center">
                <span className="text-lg font-bold tracking-tight text-foreground tabular-nums">
                  {loading ? <Skeleton className="h-5 w-8 mx-auto" /> : overview?.entryCount ?? 0}
                </span>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mt-0.5">Entries</span>
              </div>
              <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-muted/20 p-2 text-center">
                <span className="text-lg font-bold tracking-tight text-foreground tabular-nums">
                  {loading ? <Skeleton className="h-5 w-8 mx-auto" /> : overview?.contentTypeCount ?? 0}
                </span>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mt-0.5">Sections</span>
              </div>
              <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-muted/20 p-2 text-center">
                <span className="text-lg font-bold tracking-tight text-foreground tabular-nums">
                  {loading ? <Skeleton className="h-5 w-8 mx-auto" /> : overview?.assetCount ?? 0}
                </span>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mt-0.5">Assets</span>
              </div>
              <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-muted/20 p-2 text-center">
                <span className="text-lg font-bold tracking-tight text-foreground tabular-nums">
                  {loading ? <Skeleton className="h-5 w-8 mx-auto" /> : overview?.memberCount ?? 0}
                </span>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mt-0.5">Members</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Quick links</CardTitle>
              <CardDescription>Browse site files and entries</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Button variant="outline" className="h-10 justify-start gap-2.5 w-full font-normal" asChild>
                <Link to="/entries">
                  <LayoutGrid className="size-4 text-muted-foreground" />
                  <span>All entries</span>
                </Link>
              </Button>
              <Button variant="outline" className="h-10 justify-start gap-2.5 w-full font-normal" asChild>
                <Link to="/assets">
                  <Image className="size-4 text-muted-foreground" />
                  <span>Media assets</span>
                </Link>
              </Button>
              {canCreateEntries && (
                <Button variant="outline" className="h-10 justify-start gap-2.5 w-full font-normal" asChild>
                  <Link to="/content-types">
                    <Shapes className="size-4 text-muted-foreground" />
                    <span>Content structures</span>
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>

          {showAdminCard && (
            <Card className="border-border bg-card shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Administration</CardTitle>
                <CardDescription>Manage keys, team, and settings</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                {showSiteAdminTools && (
                  <>
                    <Button variant="outline" className="h-10 justify-between w-full px-3 font-normal" asChild>
                      <Link to="/admin/api-keys">
                        <span className="flex items-center gap-2.5">
                          <KeyRound className="size-4 text-muted-foreground" />
                          <span>API keys</span>
                        </span>
                        {apiKeyCount !== null ? (
                          <Badge variant="outline" className="text-[10px] h-5 px-1.5 tabular-nums font-normal">
                            {apiKeyCount}
                          </Badge>
                        ) : null}
                      </Link>
                    </Button>
                    <Button variant="outline" className="h-10 justify-between w-full px-3 font-normal" asChild>
                      <Link to="/site-settings">
                        <span className="flex items-center gap-2.5">
                          <Settings className="size-4 text-muted-foreground" />
                          <span>AI assistants (MCP)</span>
                        </span>
                        {mcpEnabled !== null ? (
                          <Badge variant={mcpEnabled ? 'default' : 'secondary'} className="text-[10px] h-5 px-1.5 font-normal">
                            {mcpEnabled ? 'On' : 'Off'}
                          </Badge>
                        ) : null}
                      </Link>
                    </Button>
                  </>
                )}
                <Button variant="outline" className="h-10 justify-between w-full px-3 font-normal" asChild>
                  <Link to="/users">
                    <span className="flex items-center gap-2.5">
                      <Users className="size-4 text-muted-foreground" />
                      <span>Team members</span>
                    </span>
                    {overview ? (
                      <Badge variant="secondary" className="tabular-nums font-normal text-xs h-5 min-w-5 px-1 flex items-center justify-center">
                        {overview.memberCount}
                      </Badge>
                    ) : null}
                  </Link>
                </Button>
                {isGlobalAdmin && (
                  <Button variant="outline" className="h-10 justify-start gap-2.5 w-full font-normal" asChild>
                    <Link to="/admin/sites">
                      <Globe className="size-4 text-muted-foreground" />
                      <span>All sites</span>
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
