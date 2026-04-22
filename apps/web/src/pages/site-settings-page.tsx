import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Globe, ImageIcon, Loader2, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { gqlRequest } from '@/api/graphql';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Combobox } from '@/components/ui/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Item, ItemContent, ItemGroup, ItemMedia } from '@/components/ui/item';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useUnsavedChangesPrompt } from '@/hooks/use-unsaved-changes-prompt';
import { buildPageTitle, useDocumentTitle } from '@/lib/page-title';
import { SiteImportExportSection } from '@/components/site-import-export-section';
import type { Asset, ContentType, Entry, Site } from '@/types/app';

const ASSET_PREVIEW_GQL = `id filename mimeType variants { thumbnail web }`;

const MENU_SLOT_KEY_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
const MENU_SLOT_MAX = 50;

type MenuRow = { rowId: string; slotKey: string; entryId: string };

function newMenuRowId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `r-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function menuEntriesToRows(entries: Record<string, string>): MenuRow[] {
  return Object.entries(entries).map(([slotKey, entryId]) => ({
    rowId: newMenuRowId(),
    slotKey,
    entryId,
  }));
}

/** Stable snapshot for dirty checks (allows incomplete rows while editing). */
function menuRowsSnapshot(rows: MenuRow[]) {
  return rows.map((r) => ({ slotKey: r.slotKey.trim(), entryId: r.entryId.trim() }));
}

function buildMenuEntriesPayload(rows: MenuRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  const seen = new Set<string>();
  for (const row of rows) {
    const k = row.slotKey.trim();
    const eid = row.entryId.trim();
    if (!k && !eid) continue;
    if (!k || !eid) {
      throw new Error('Each menu slot needs both a key and a selected entry, or remove incomplete rows.');
    }
    if (!MENU_SLOT_KEY_RE.test(k)) {
      throw new Error(
        `Invalid menu key "${k}". Start with a letter, then use letters, numbers, underscores, or hyphens (1–64 characters).`,
      );
    }
    if (seen.has(k)) throw new Error(`Duplicate menu key "${k}".`);
    seen.add(k);
    out[k] = eid;
  }
  if (Object.keys(out).length > MENU_SLOT_MAX) {
    throw new Error(`At most ${MENU_SLOT_MAX} menu slots.`);
  }
  return out;
}

type SiteSettingsGql = {
  id: string | null;
  siteId: string;
  logoAssetId: string | null;
  faviconAssetId: string | null;
  siteTitle: string | null;
  menuEntries: Record<string, string>;
  logo: Asset | null;
  favicon: Asset | null;
};

type SiteSettingsPageProps = {
  token: string;
  workspaceSiteId: string;
  sites: Site[];
  /** Refetch `listMySites` after updating site name/URL. */
  onSitesChanged?: () => Promise<void>;
};

function siteUrlHref(url: string): string {
  const t = url.trim();
  if (!t) return '#';
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

/** Host/path for the URL field (no scheme) — matches the https:// prefix in the input group. */
function siteUrlHostPart(url: string): string {
  return url.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function AssetPickerDialog({
  open,
  onOpenChange,
  title,
  token,
  siteId,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  token: string;
  siteId: string;
  onSelect: (asset: Asset) => void;
}) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const res = await gqlRequest<{ listAssets: Asset[] }>(
        token,
        `query($siteId:ID!,$q:String){ listAssets(siteId:$siteId,query:$q,limit:60){ ${ASSET_PREVIEW_GQL} } }`,
        { siteId, q: query.trim() || undefined },
      );
      setAssets(res.listAssets);
    } catch {
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, [token, siteId, query]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(t);
  }, [open, load]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Select from media library.</DialogDescription>
        </DialogHeader>
        <Input
          placeholder="Search by filename…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mb-3"
        />
        <div className="max-h-72 overflow-auto rounded-md border">
          {loading ? (
            <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading…
            </div>
          ) : assets.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No images match your search.</div>
          ) : (
            <ul className="grid grid-cols-3 gap-2 p-2">
              {assets.map((asset) => (
                <li key={asset.id}>
                  <button
                    type="button"
                    className="group flex w-full flex-col overflow-hidden rounded-md border bg-muted/30 text-left transition hover:border-primary"
                    onClick={() => {
                      onSelect(asset);
                      onOpenChange(false);
                    }}
                  >
                    <div className="aspect-square bg-muted">
                      <img
                        src={asset.variants.thumbnail}
                        alt=""
                        className="size-full object-cover"
                      />
                    </div>
                    <span className="truncate px-1 py-1 text-xs text-muted-foreground group-hover:text-foreground">
                      {asset.filename}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SiteSettingsPage({ token, workspaceSiteId, sites, onSitesChanged }: SiteSettingsPageProps) {
  const activeSite = sites.find((s) => s.id === workspaceSiteId);
  useDocumentTitle(buildPageTitle('Site settings', activeSite?.name?.trim() || 'Workspace'));

  const canEdit =
    activeSite?.role === 'owner' || activeSite?.role === 'admin' || activeSite?.role === 'editor';
  const canManageSiteIdentity =
    activeSite?.role === 'owner' || activeSite?.role === 'admin';
  const canManageBundle = activeSite?.role === 'owner' || activeSite?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const [logoAssetId, setLogoAssetId] = useState<string | null>(null);
  const [faviconAssetId, setFaviconAssetId] = useState<string | null>(null);
  const [siteTitle, setSiteTitle] = useState('');
  const [menuRows, setMenuRows] = useState<MenuRow[]>([]);

  const [logoPreview, setLogoPreview] = useState<Asset | null>(null);
  const [faviconPreview, setFaviconPreview] = useState<Asset | null>(null);

  const [picker, setPicker] = useState<'logo' | 'favicon' | null>(null);
  const [entryOptions, setEntryOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [entryGroups, setEntryGroups] = useState<Array<{ label: string; options: Array<{ value: string; label: string }> }>>([]);
  const [contentTypesForBundle, setContentTypesForBundle] = useState<Array<{ id: string; name: string; slug: string }>>([]);

  const logoFileRef = useRef<HTMLInputElement>(null);
  const faviconFileRef = useRef<HTMLInputElement>(null);

  const [siteNameDraft, setSiteNameDraft] = useState('');
  const [siteUrlDraft, setSiteUrlDraft] = useState('');

  useEffect(() => {
    const s = sites.find((x) => x.id === workspaceSiteId);
    if (!s) return;
    setSiteNameDraft(s.name);
    setSiteUrlDraft(siteUrlHostPart(s.url));
  }, [workspaceSiteId, sites]);

  const loadSettings = useCallback(async () => {
    if (!workspaceSiteId) return;
    setLoading(true);
    setError('');
    try {
      const res = await gqlRequest<{ siteSettings: SiteSettingsGql }>(
        token,
        `query($siteId:ID!){
          siteSettings(siteId:$siteId){
            id siteId logoAssetId faviconAssetId siteTitle menuEntries
            logo { ${ASSET_PREVIEW_GQL} }
            favicon { ${ASSET_PREVIEW_GQL} }
          }
        }`,
        { siteId: workspaceSiteId },
      );
      const s = res.siteSettings;
      setLogoAssetId(s.logoAssetId);
      setFaviconAssetId(s.faviconAssetId);
      setSiteTitle(s.siteTitle ?? '');
      setMenuRows(menuEntriesToRows(s.menuEntries ?? {}));
      setLogoPreview(s.logo);
      setFaviconPreview(s.favicon);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load site settings');
    } finally {
      setLoading(false);
    }
  }, [token, workspaceSiteId]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const loadEntries = useCallback(async () => {
    if (!workspaceSiteId) return;
    try {
      const ctRes = await gqlRequest<{ contentTypes: ContentType[] }>(
        token,
        'query($siteId:ID!){ contentTypes(siteId:$siteId){ id name slug } }',
        { siteId: workspaceSiteId },
      );
      const cts = ctRes.contentTypes;

      const groups: Array<{ label: string; options: Array<{ value: string; label: string }> }> = [];
      const flat: Array<{ value: string; label: string }> = [];

      await Promise.all(
        cts.map(async (ct) => {
          const entryRes = await gqlRequest<{ entries: Entry[] }>(
            token,
            'query($siteId:ID!,$contentTypeId:ID!){ entries(siteId:$siteId,contentTypeId:$contentTypeId,limit:500){ id name contentTypeId } }',
            { siteId: workspaceSiteId, contentTypeId: ct.id },
          );
          const opts = entryRes.entries.map((e) => ({
            value: e.id,
            label: e.name,
          }));
          if (opts.length) {
            groups.push({ label: ct.name, options: opts });
            flat.push(...opts);
          }
        }),
      );

      setEntryGroups(groups);
      setEntryOptions(flat);
      setContentTypesForBundle(cts.map((ct) => ({ id: ct.id, name: ct.name, slug: ct.slug })));
    } catch {
      setEntryGroups([]);
      setEntryOptions([]);
      setContentTypesForBundle([]);
    }
  }, [token, workspaceSiteId]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const prevLoadingRef = useRef(true);

  const snapshot = useMemo(() => {
    if (!workspaceSiteId || !activeSite) return '';
    return JSON.stringify({
      logoAssetId,
      faviconAssetId,
      siteTitle: siteTitle.trim(),
      menu: menuRowsSnapshot(menuRows),
      ...(canManageSiteIdentity ? { siteName: siteNameDraft.trim(), siteUrl: siteUrlHostPart(siteUrlDraft) } : {}),
    });
  }, [
    workspaceSiteId,
    activeSite,
    logoAssetId,
    faviconAssetId,
    siteTitle,
    menuRows,
    canManageSiteIdentity,
    siteNameDraft,
    siteUrlDraft,
  ]);

  useEffect(() => {
    setSavedSnapshot(null);
  }, [workspaceSiteId]);

  useEffect(() => {
    if (prevLoadingRef.current && !loading && workspaceSiteId && activeSite) {
      setSavedSnapshot(
        JSON.stringify({
          logoAssetId,
          faviconAssetId,
          siteTitle: siteTitle.trim(),
          menu: menuRowsSnapshot(menuRows),
          ...(canManageSiteIdentity ? { siteName: siteNameDraft.trim(), siteUrl: siteUrlHostPart(siteUrlDraft) } : {}),
        }),
      );
    }
    prevLoadingRef.current = loading;
  }, [
    loading,
    workspaceSiteId,
    activeSite,
    logoAssetId,
    faviconAssetId,
    siteTitle,
    menuRows,
    canManageSiteIdentity,
    siteNameDraft,
    siteUrlDraft,
  ]);

  const isDirty =
    Boolean(canEdit && workspaceSiteId && savedSnapshot !== null && snapshot !== '' && snapshot !== savedSnapshot);
  const unsavedPrompt = useUnsavedChangesPrompt({ isDirty });

  function updateMenuRow(rowId: string, patch: Partial<Pick<MenuRow, 'slotKey' | 'entryId'>>) {
    setMenuRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  }

  function addMenuRow() {
    setMenuRows((prev) => [...prev, { rowId: newMenuRowId(), slotKey: '', entryId: '' }]);
  }

  function removeMenuRow(rowId: string) {
    setMenuRows((prev) => prev.filter((r) => r.rowId !== rowId));
  }

  async function uploadAsset(file: File) {
    const fileBase64 = await fileToBase64(file);
    const res = await gqlRequest<{ uploadAsset: Asset }>(
      token,
      `mutation($siteId:ID!,$fileBase64:String!,$filename:String!,$mimeType:String!){ uploadAsset(siteId:$siteId,fileBase64:$fileBase64,filename:$filename,mimeType:$mimeType){ ${ASSET_PREVIEW_GQL} } }`,
      {
        siteId: workspaceSiteId,
        fileBase64,
        filename: file.name,
        mimeType: file.type,
      },
    );
    return res.uploadAsset;
  }

  async function handleSave() {
    if (!canEdit || !workspaceSiteId) return;
    setSaving(true);
    setError('');
    setSavedAt(null);
    try {
      if (canManageSiteIdentity && activeSite) {
        const nameNext = siteNameDraft.trim();
        const urlNext = siteUrlHostPart(siteUrlDraft);
        if (!nameNext) {
          throw new Error('Site name cannot be empty.');
        }
        if (!urlNext) {
          throw new Error('Site URL cannot be empty.');
        }
        const currentHost = siteUrlHostPart(activeSite.url);
        if (nameNext !== activeSite.name.trim() || urlNext !== currentHost) {
          const variables: Record<string, unknown> = { siteId: workspaceSiteId };
          if (nameNext !== activeSite.name.trim()) variables.name = nameNext;
          if (urlNext !== currentHost) variables.url = urlNext;
          await gqlRequest<{ updateSite: { id: string; name: string; url: string } }>(
            token,
            'mutation($siteId:ID!,$name:String,$url:String){ updateSite(siteId:$siteId,name:$name,url:$url){ id name url } }',
            variables,
          );
          await onSitesChanged?.();
        }
      }

      const menuEntriesPayload = buildMenuEntriesPayload(menuRows);

      await gqlRequest(
        token,
        `mutation($siteId:ID!,$input:SiteSettingsInput!){
          updateSiteSettings(siteId:$siteId,input:$input){
            id siteId logoAssetId faviconAssetId siteTitle menuEntries
          }
        }`,
        {
          siteId: workspaceSiteId,
          input: {
            logoAssetId: logoAssetId ?? null,
            faviconAssetId: faviconAssetId ?? null,
            siteTitle: siteTitle.trim() || null,
            menuEntries: menuEntriesPayload,
          },
        },
      );
      await loadSettings();
      setSavedAt(new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const hasEntries = entryOptions.length > 0;

  if (!workspaceSiteId) {
    return (
      <>
        {unsavedPrompt}
        <div className="w-full space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Site settings</CardTitle>
              <CardDescription>Manage branding, identity, and menus.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </>
    );
  }

  const siteUrl = activeSite?.url?.trim() ?? '';

  return (
    <>
      {unsavedPrompt}
      <div className="w-full space-y-4">
      <Card className="flex flex-col gap-0 p-0">
        <CardHeader className="mb-0 flex flex-col gap-4 space-y-0 border-b border-border px-6 py-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle>Site settings</CardTitle>
            <CardDescription>
              Manage branding, workspace identity, and menu assignments.
            </CardDescription>
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
            {savedAt ? (
              <span className="text-xs text-muted-foreground">Saved {new Date(savedAt).toLocaleString()}</span>
            ) : null}
            <Button type="button" disabled={!canEdit || saving || loading} onClick={() => void handleSave()}>
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
              Save
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-8 px-6 py-6">
          {error ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {!canEdit ? (
            <p className="text-sm text-muted-foreground">Read-only access.</p>
          ) : null}

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading settings…
            </div>
          ) : (
            <>
              <section className="space-y-4">
                <div className="space-y-1">
                  <h4 className="text-base font-semibold leading-none">Site</h4>
                  <p className="text-sm text-muted-foreground">
                    Canonical workspace identity and public URL.
                  </p>
                </div>
                <ItemGroup className="gap-3">
                  <Item variant="muted" className="w-full flex-col items-stretch gap-4">
                    <ItemContent className="w-full gap-4">
                      <div className="grid gap-6 sm:grid-cols-2">
                        <Field>
                          <FieldLabel>Site name</FieldLabel>
                          <FieldContent>
                            {canManageSiteIdentity ? (
                              <Input
                                value={siteNameDraft}
                                onChange={(e) => setSiteNameDraft(e.target.value)}
                                autoComplete="organization"
                                disabled={!canEdit}
                              />
                            ) : (
                              <p className="text-sm font-medium">{activeSite?.name ?? '—'}</p>
                            )}
                          </FieldContent>
                        </Field>
                        <Field>
                          <FieldLabel>Site URL</FieldLabel>
                          <FieldContent className="space-y-1">
                            {canManageSiteIdentity ? (
                              <InputGroup className="min-w-0">
                                <InputGroupAddon>
                                  <InputGroupText>
                                    <Globe aria-hidden />
                                    https://
                                  </InputGroupText>
                                </InputGroupAddon>
                                <InputGroupInput
                                  value={siteUrlDraft}
                                  onChange={(e) => setSiteUrlDraft(e.target.value)}
                                  placeholder="edelweisspraktijk.nl"
                                  autoComplete="url"
                                  disabled={!canEdit}
                                  className="min-w-0"
                                />
                              </InputGroup>
                            ) : siteUrl ? (
                              <a
                                href={siteUrlHref(siteUrl)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm font-medium text-primary underline underline-offset-2 break-all"
                              >
                                {siteUrl}
                              </a>
                            ) : (
                              <p className="text-sm text-muted-foreground">—</p>
                            )}
                            {canManageSiteIdentity ? (
                              <FieldDescription>
                                  Public site key and host (no scheme).
                                </FieldDescription>
                            ) : null}
                          </FieldContent>
                        </Field>
                      </div>
                    </ItemContent>
                  </Item>
                </ItemGroup>
              </section>

              <Separator />

              <section className="space-y-4">
                <div className="space-y-1">
                  <h4 className="text-base font-semibold leading-none">Branding</h4>
                  <p className="text-sm text-muted-foreground">
                    Logo and favicon are stored as media assets. Leave title empty to use the site name.
                  </p>
                </div>
                <ItemGroup className="gap-3">
                  <Item variant="muted" className="w-full flex-col items-stretch gap-3">
                    <ItemContent className="w-full gap-2">
                      <Field>
                        <FieldLabel>Site title override</FieldLabel>
                        <FieldContent>
                          <Input
                            value={siteTitle}
                            onChange={(e) => setSiteTitle(e.target.value)}
                            placeholder={activeSite?.name ?? 'Site name'}
                            disabled={!canEdit}
                          />
                          <FieldDescription>Page title and Open Graph override.</FieldDescription>
                        </FieldContent>
                      </Field>
                    </ItemContent>
                  </Item>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Item variant="muted" className="w-full flex-col items-stretch gap-3">
                      <Field>
                        <FieldLabel>Logo</FieldLabel>
                        <FieldContent className="space-y-2">
                          <div className="flex items-start gap-3">
                            <ItemMedia variant="image" className="size-20 shrink-0 rounded-md border bg-muted">
                              {logoPreview ? (
                                <img src={logoPreview.variants.thumbnail} alt="" className="object-contain" />
                              ) : (
                                <div className="flex size-full items-center justify-center">
                                  <ImageIcon className="size-8 text-muted-foreground" />
                                </div>
                              )}
                            </ItemMedia>
                            <div className="flex min-w-0 flex-1 flex-col gap-2">
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  disabled={!canEdit}
                                  onClick={() => setPicker('logo')}
                                >
                                  Library
                                </Button>
                                <input
                                  ref={logoFileRef}
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  disabled={!canEdit}
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    e.target.value = '';
                                    if (!file) return;
                                    try {
                                      const asset = await uploadAsset(file);
                                      setLogoAssetId(asset.id);
                                      setLogoPreview(asset);
                                    } catch (err) {
                                      setError(err instanceof Error ? err.message : 'Upload failed');
                                    }
                                  }}
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={!canEdit}
                                  onClick={() => logoFileRef.current?.click()}
                                >
                                  <Plus className="mr-1 size-3" />
                                  Upload
                                </Button>
                                {logoAssetId ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={!canEdit}
                                    onClick={() => {
                                      setLogoAssetId(null);
                                      setLogoPreview(null);
                                    }}
                                  >
                                    <X className="mr-1 size-3" />
                                    Clear
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </FieldContent>
                      </Field>
                    </Item>

                    <Item variant="muted" className="w-full flex-col items-stretch gap-3">
                      <Field>
                        <FieldLabel>Favicon</FieldLabel>
                        <FieldContent className="space-y-2">
                          <div className="flex items-start gap-3">
                            <ItemMedia variant="image" className="size-20 shrink-0 rounded-md border bg-muted">
                              {faviconPreview ? (
                                <img src={faviconPreview.variants.thumbnail} alt="" className="object-contain" />
                              ) : (
                                <div className="flex size-full items-center justify-center">
                                  <ImageIcon className="size-8 text-muted-foreground" />
                                </div>
                              )}
                            </ItemMedia>
                            <div className="flex min-w-0 flex-1 flex-col gap-2">
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  disabled={!canEdit}
                                  onClick={() => setPicker('favicon')}
                                >
                                  Library
                                </Button>
                                <input
                                  ref={faviconFileRef}
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  disabled={!canEdit}
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    e.target.value = '';
                                    if (!file) return;
                                    try {
                                      const asset = await uploadAsset(file);
                                      setFaviconAssetId(asset.id);
                                      setFaviconPreview(asset);
                                    } catch (err) {
                                      setError(err instanceof Error ? err.message : 'Upload failed');
                                    }
                                  }}
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={!canEdit}
                                  onClick={() => faviconFileRef.current?.click()}
                                >
                                  <Plus className="mr-1 size-3" />
                                  Upload
                                </Button>
                                {faviconAssetId ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={!canEdit}
                                    onClick={() => {
                                      setFaviconAssetId(null);
                                      setFaviconPreview(null);
                                    }}
                                  >
                                    <X className="mr-1 size-3" />
                                    Clear
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </FieldContent>
                      </Field>
                    </Item>
                  </div>
                </ItemGroup>
              </section>

              <Separator />

              <section className="space-y-6">
                <div className="space-y-1">
                  <h4 className="text-base font-semibold leading-none">Menus</h4>
                  <p className="text-sm text-muted-foreground">
                    Map named slots to entries for navigation and site structure.
                  </p>
                </div>

                {!hasEntries ? (
                  <Item variant="muted" className="w-full flex-col items-stretch">
                    <ItemContent className="w-full">
                      <p className="text-sm text-muted-foreground">
                        No entries yet. Create a content type for menus under{' '}
                        <Link to="/content-types" className="underline underline-offset-2">
                          Content types
                        </Link>
                        , then add entries under{' '}
                        <Link to="/entries" className="underline underline-offset-2">
                          Entries
                        </Link>
                        .
                      </p>
                    </ItemContent>
                  </Item>
                ) : (
                  <Item variant="muted" className="w-full">
                    <ItemContent className="flex w-full flex-col gap-3">
                      <Field>
                        <FieldLabel>Menu slots</FieldLabel>
                      </Field>

                      {menuRows.length ? (
                        <div className="space-y-3">
                          {menuRows.map((row) => (
                            <Card key={row.rowId} className="gap-0 overflow-hidden border-border bg-background p-0 shadow-sm">
                              <div className="px-4 py-3 sm:px-5">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-3">
                                  <Field className="min-w-0 flex-1">
                                    <FieldLabel>Slot key</FieldLabel>
                                    <FieldContent>
                                      <Input
                                        value={row.slotKey}
                                        onChange={(e) => updateMenuRow(row.rowId, { slotKey: e.target.value })}
                                        placeholder="header"
                                        autoComplete="off"
                                        spellCheck={false}
                                        disabled={!canEdit}
                                      />
                                    </FieldContent>
                                  </Field>
                                  <Field className="min-w-0 flex-1 sm:min-w-[14rem]">
                                    <FieldLabel>Entry</FieldLabel>
                                    <FieldContent>
                                      <Combobox
                                        value={row.entryId}
                                        onValueChange={(next) => updateMenuRow(row.rowId, { entryId: next })}
                                        groups={entryGroups.length ? entryGroups : undefined}
                                        options={entryGroups.length ? [] : entryOptions}
                                        placeholder="Select entry…"
                                        emptyText="No entries in this site."
                                        disabled={!canEdit || !hasEntries}
                                      />
                                    </FieldContent>
                                  </Field>
                                  <div className="flex shrink-0 items-center gap-0.5 self-end sm:pb-0.5">
                                    {row.entryId ? (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button variant="ghost" size="icon-sm" asChild>
                                            <Link to={`/entries/${row.entryId}`} aria-label="Edit entry">
                                              <Pencil className="size-4" />
                                            </Link>
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top">Edit entry</TooltipContent>
                                      </Tooltip>
                                    ) : null}
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon-sm"
                                          className="text-muted-foreground hover:text-destructive"
                                          disabled={!canEdit}
                                          onClick={() => removeMenuRow(row.rowId)}
                                          aria-label="Remove menu slot"
                                        >
                                          <Trash2 className="size-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent side="top">Remove menu slot</TooltipContent>
                                    </Tooltip>
                                  </div>
                                </div>
                                {!row.entryId ? (
                                  <p className="mt-2 text-xs text-muted-foreground">
                                    Choose a slot key and an entry, or remove this row.
                                  </p>
                                ) : null}
                              </div>
                            </Card>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No menu slots yet.</p>
                      )}

                      {canEdit ? (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="self-start text-primary hover:bg-primary/10 hover:text-primary"
                            disabled={menuRows.length >= MENU_SLOT_MAX}
                            onClick={() => addMenuRow()}
                          >
                            <Plus className="h-4 w-4" />
                            Add menu
                          </Button>
                        </div>
                      ) : null}
                    </ItemContent>
                  </Item>
                )}
              </section>

              {!loading && canManageBundle ? (
                <SiteImportExportSection
                  token={token}
                  siteId={workspaceSiteId}
                  siteLabel={activeSite?.name ?? 'site'}
                  contentTypes={contentTypesForBundle}
                  onImported={async () => {
                    await loadSettings();
                    await loadEntries();
                    await onSitesChanged?.();
                  }}
                />
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <AssetPickerDialog
        open={picker === 'logo'}
        onOpenChange={(o) => !o && setPicker(null)}
        title="Choose logo"
        token={token}
        siteId={workspaceSiteId}
        onSelect={(asset) => {
          setLogoAssetId(asset.id);
          setLogoPreview(asset);
        }}
      />
      <AssetPickerDialog
        open={picker === 'favicon'}
        onOpenChange={(o) => !o && setPicker(null)}
        title="Choose favicon"
        token={token}
        siteId={workspaceSiteId}
        onSelect={(asset) => {
          setFaviconAssetId(asset.id);
          setFaviconPreview(asset);
        }}
      />
    </div>
    </>
  );
}
