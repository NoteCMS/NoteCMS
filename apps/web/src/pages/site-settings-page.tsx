import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Globe, ImageIcon, Loader2, Pencil, Plus, Rocket, Save, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { gqlRequest } from '@/api/graphql';
import { DeploySheetErrorBoundary } from '@/components/deploy-sheet-error-boundary';
import { LoadErrorAlert } from '@/components/load-error-alert';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { toast } from 'sonner';
import { useUnsavedChangesPrompt } from '@/hooks/use-unsaved-changes-prompt';
import { buildPageTitle, useDocumentTitle } from '@/lib/page-title';
import { SiteImportExportSection } from '@/components/site-import-export-section';
import { SiteBackupsSection } from '@/components/site-backups-section';
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
  publishEnabled: boolean;
  publishGithubOwner: string | null;
  publishGithubRepo: string | null;
  publishGithubRepoUrl: string | null;
  publishEventType: string | null;
  hasPublishPat: boolean;
  publishWebhookPostUrl: string | null;
  hasPublishReturnToken: boolean;
  publishLastTriggerAt: string | null;
  publishLastTriggerOk: boolean | null;
  publishLastTriggerStatusCode: number | null;
  publishLastTriggerMessage: string | null;
  publishLastReturnAt: string | null;
  publishLastReturnStatus: string | null;
  publishLastReturnRunUrl: string | null;
  publishLastReturnPayload: unknown;
  backupEnabled: boolean;
};

const PUBLISH_SITE_SETTINGS_FIELDS = `
  publishEnabled publishGithubOwner publishGithubRepo publishGithubRepoUrl publishEventType hasPublishPat
  publishWebhookPostUrl hasPublishReturnToken
  publishLastTriggerAt publishLastTriggerOk publishLastTriggerStatusCode publishLastTriggerMessage
  publishLastReturnAt publishLastReturnStatus publishLastReturnRunUrl publishLastReturnPayload
`;

type SiteSettingsPageProps = {
  token: string;
  workspaceSiteId: string;
  sites: Site[];
  /** Refetch `listMySites` after updating site name/URL. */
  onSitesChanged?: () => Promise<void>;
  /** Platform admin: can configure publish webhooks on any workspace. */
  isGlobalAdmin?: boolean;
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

export function SiteSettingsPage({
  token,
  workspaceSiteId,
  sites,
  onSitesChanged,
  isGlobalAdmin: isGlobalAdminProp,
}: SiteSettingsPageProps) {
  const activeSite = sites.find((s) => s.id === workspaceSiteId);
  useDocumentTitle(buildPageTitle('Site settings', activeSite?.name?.trim() || 'Workspace'));

  const isGlobalAdmin = Boolean(isGlobalAdminProp);
  const canEdit =
    activeSite?.role === 'owner' || activeSite?.role === 'editor';
  const canManageSiteIdentity =
    activeSite?.role === 'owner';
  const canManageBundle = activeSite?.role === 'owner';
  const canConfigurePublishWebhook = isGlobalAdmin || activeSite?.role === 'owner';
  const canTriggerPublishWebhook = canEdit;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deploySheetError, setDeploySheetError] = useState('');
  const [deploySheetBoundaryKey, setDeploySheetBoundaryKey] = useState(0);
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

  const [publishEnabled, setPublishEnabled] = useState(false);
  const [publishRepoUrl, setPublishRepoUrl] = useState('');
  const [publishEventType, setPublishEventType] = useState('');
  const [publishHasPat, setPublishHasPat] = useState(false);
  const [publishWebhookPostUrl, setPublishWebhookPostUrl] = useState<string | null>(null);
  const [publishHasReturnToken, setPublishHasReturnToken] = useState(false);
  const [publishLastTriggerAt, setPublishLastTriggerAt] = useState<string | null>(null);
  const [publishLastTriggerOk, setPublishLastTriggerOk] = useState<boolean | null>(null);
  const [publishLastTriggerMessage, setPublishLastTriggerMessage] = useState<string | null>(null);
  const [publishLastReturnAt, setPublishLastReturnAt] = useState<string | null>(null);
  const [publishLastReturnStatus, setPublishLastReturnStatus] = useState<string | null>(null);
  const [publishLastReturnRunUrl, setPublishLastReturnRunUrl] = useState<string | null>(null);
  const [publishPatDraft, setPublishPatDraft] = useState('');
  const [publishPatClear, setPublishPatClear] = useState(false);
  const [publishSaving, setPublishSaving] = useState(false);
  const [publishRotating, setPublishRotating] = useState(false);
  const [publishDisablingReturn, setPublishDisablingReturn] = useState(false);
  const [publishTriggering, setPublishTriggering] = useState(false);
  const [returnSetup, setReturnSetup] = useState<{ callbackUrl: string } | null>(null);
  const [returnCopyHint, setReturnCopyHint] = useState('');
  const [backupEnabled, setBackupEnabled] = useState(true);
  const [deploySheetOpen, setDeploySheetOpen] = useState(false);

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

  const loadSettings = useCallback(
    async (opts?: { errorTarget?: 'page' | 'sheet'; quiet?: boolean }) => {
      if (!workspaceSiteId) return;
      const errorTarget = opts?.errorTarget ?? 'page';
      const quiet = opts?.quiet ?? false;
      if (!quiet) setLoading(true);
      if (errorTarget === 'page') setError('');
      else setDeploySheetError('');
      try {
      const res = await gqlRequest<{ siteSettings: SiteSettingsGql }>(
        token,
        `query($siteId:ID!){
          siteSettings(siteId:$siteId){
            id siteId logoAssetId faviconAssetId siteTitle menuEntries
            logo { ${ASSET_PREVIEW_GQL} }
            favicon { ${ASSET_PREVIEW_GQL} }
            ${PUBLISH_SITE_SETTINGS_FIELDS}
            backupEnabled
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
      setPublishEnabled(Boolean(s.publishEnabled));
      setPublishRepoUrl(s.publishGithubRepoUrl ?? '');
      setPublishEventType(s.publishEventType ?? '');
      setPublishHasPat(Boolean(s.hasPublishPat));
      setPublishWebhookPostUrl(s.publishWebhookPostUrl ?? null);
      setPublishHasReturnToken(Boolean(s.hasPublishReturnToken));
      setPublishLastTriggerAt(s.publishLastTriggerAt ?? null);
      setPublishLastTriggerOk(typeof s.publishLastTriggerOk === 'boolean' ? s.publishLastTriggerOk : null);
      setPublishLastTriggerMessage(s.publishLastTriggerMessage ?? null);
      setPublishLastReturnAt(s.publishLastReturnAt ?? null);
      setPublishLastReturnStatus(s.publishLastReturnStatus ?? null);
      setPublishLastReturnRunUrl(s.publishLastReturnRunUrl ?? null);
      setBackupEnabled(s.backupEnabled !== false);
      setPublishPatDraft('');
      setPublishPatClear(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load site settings';
      if (errorTarget === 'sheet') setDeploySheetError(msg);
      else setError(msg);
    } finally {
      if (!quiet) setLoading(false);
    }
    },
    [token, workspaceSiteId],
  );

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

  const publishDispatchReady =
    publishEnabled &&
    publishHasPat &&
    publishRepoUrl.trim().length > 0 &&
    publishEventType.trim().length > 0;

  const buildsSummaryLine = useMemo(() => {
    if (loading) return 'Loading…';
    if (publishLastReturnAt) {
      const when = new Date(publishLastReturnAt).toLocaleString();
      const st = publishLastReturnStatus?.trim();
      return `Last build finished ${when}${st ? ` · ${st}` : ''}`;
    }
    if (publishLastTriggerAt) {
      const when = new Date(publishLastTriggerAt).toLocaleString();
      if (publishLastTriggerOk === false) return `Last deploy started ${when} · something went wrong`;
      return `Last deploy started ${when}`;
    }
    if (publishDispatchReady) return 'Ready — open the panel to run a build or adjust settings.';
    return 'Not connected yet — open the panel to link your repository.';
  }, [
    loading,
    publishLastReturnAt,
    publishLastReturnStatus,
    publishLastTriggerAt,
    publishLastTriggerOk,
    publishDispatchReady,
  ]);

  const buildsSetupDone = Boolean(publishDispatchReady || publishHasReturnToken || publishEnabled);

  async function handleSavePublishWebhook() {
    if (!canConfigurePublishWebhook || !workspaceSiteId) return;
    setPublishSaving(true);
    setDeploySheetError('');
    try {
      const input: Record<string, unknown> = {
        publishEnabled,
        githubRepoUrl: publishRepoUrl.trim(),
        publishEventType: publishEventType.trim() || null,
      };
      if (publishPatClear) input.githubPat = '';
      else if (publishPatDraft.trim()) input.githubPat = publishPatDraft.trim();

      await gqlRequest(
        token,
        `mutation($siteId:ID!,$input:PublishWebhookInput!){
          updatePublishWebhook(siteId:$siteId,input:$input){
            id siteId ${PUBLISH_SITE_SETTINGS_FIELDS}
          }
        }`,
        { siteId: workspaceSiteId, input },
      );
      await loadSettings({ errorTarget: 'sheet', quiet: true });
      toast.success('Build webhook settings saved');
    } catch (e) {
      setDeploySheetError(e instanceof Error ? e.message : 'Failed to save webhook settings');
    } finally {
      setPublishSaving(false);
    }
  }

  async function handleRotateReturnWebhook() {
    if (!canConfigurePublishWebhook || !workspaceSiteId) return;
    setPublishRotating(true);
    setDeploySheetError('');
    try {
      const res = await gqlRequest<{
        rotatePublishReturnWebhook: { callbackUrl: string };
      }>(
        token,
        `mutation($siteId:ID!){ rotatePublishReturnWebhook(siteId:$siteId){ callbackUrl } }`,
        { siteId: workspaceSiteId },
      );
      setReturnSetup(res.rotatePublishReturnWebhook);
      await loadSettings({ errorTarget: 'sheet', quiet: true });
    } catch (e) {
      setDeploySheetError(e instanceof Error ? e.message : 'Failed to generate callback');
    } finally {
      setPublishRotating(false);
    }
  }

  async function handleDisableReturnWebhook() {
    if (!canConfigurePublishWebhook || !workspaceSiteId) return;
    if (
      !window.confirm(
        'Disable the build completion callback? Existing GitHub workflow secrets that use this link will stop working until you generate a new one.',
      )
    )
      return;
    setPublishDisablingReturn(true);
    setDeploySheetError('');
    try {
      await gqlRequest(
        token,
        `mutation($siteId:ID!){ disablePublishReturnWebhook(siteId:$siteId){ id siteId ${PUBLISH_SITE_SETTINGS_FIELDS} } }`,
        { siteId: workspaceSiteId },
      );
      await loadSettings({ errorTarget: 'sheet', quiet: true });
      toast.success('Callback disabled');
    } catch (e) {
      setDeploySheetError(e instanceof Error ? e.message : 'Failed to disable callback');
    } finally {
      setPublishDisablingReturn(false);
    }
  }

  async function handleTriggerPublish() {
    if (!workspaceSiteId || !canEdit) return;
    setPublishTriggering(true);
    setDeploySheetError('');
    try {
      const res = await gqlRequest<{
        triggerPublishWebhook: { ok: boolean; message: string };
      }>(token, `mutation($siteId:ID!){ triggerPublishWebhook(siteId:$siteId){ ok message } }`, {
        siteId: workspaceSiteId,
      });
      const r = res.triggerPublishWebhook;
      if (r.ok) toast.success(r.message || 'Build triggered');
      else toast.error(r.message || 'Could not trigger build');
      await loadSettings({ errorTarget: 'sheet', quiet: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Trigger failed';
      setDeploySheetError(msg);
      toast.error(msg);
    } finally {
      setPublishTriggering(false);
    }
  }

  async function copyReturnField(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setReturnCopyHint(`${label} copied.`);
      window.setTimeout(() => setReturnCopyHint(''), 2500);
    } catch {
      setReturnCopyHint('Could not copy.');
    }
  }

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
            <LoadErrorAlert title="Site settings" message={error} onRetry={() => void loadSettings()} />
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

              <section className="space-y-3">
                <div className="space-y-1">
                  <h4 className="text-base font-semibold leading-none">Builds</h4>
                  <p className="text-sm text-muted-foreground">
                    Connect GitHub so your team can start deploys from here—without digging through repo settings.
                  </p>
                </div>
                <Item variant="muted" className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <ItemContent className="min-w-0 gap-1">
                    <p className="text-sm font-medium text-foreground">GitHub Actions</p>
                    <p className="text-xs text-muted-foreground">{buildsSummaryLine}</p>
                  </ItemContent>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setDeploySheetOpen(true)}
                  >
                    <Rocket className="mr-2 size-4" aria-hidden />
                    {buildsSetupDone ? 'Manage builds' : 'Set up builds'}
                  </Button>
                </Item>
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
                <>
                <SiteBackupsSection
                  token={token}
                  siteId={workspaceSiteId}
                  siteLabel={activeSite?.name ?? 'site'}
                  backupEnabled={backupEnabled}
                  onSettingsChanged={loadSettings}
                />
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
                </>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Sheet
        open={deploySheetOpen}
        onOpenChange={(open) => {
          setDeploySheetOpen(open);
          if (open) {
            setDeploySheetError('');
            setDeploySheetBoundaryKey((k) => k + 1);
          }
        }}
      >
        <SheetContent
          side="right"
          className="flex h-[100dvh] max-h-[100dvh] w-full flex-col gap-0 overflow-hidden border-0 p-0 shadow-xl sm:max-w-md md:max-w-lg"
        >
          <SheetHeader className="shrink-0 space-y-1 border-b border-border px-6 py-5 text-left">
            <SheetTitle>Builds with GitHub</SheetTitle>
            <SheetDescription className="text-pretty">
              Start a deploy from here, and optionally report back when your GitHub workflow finishes so this workspace
              shows the latest status.
            </SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-6">
            {deploySheetError ? (
              <LoadErrorAlert
                className="mb-4"
                title="Build panel"
                message={deploySheetError}
                onRetry={() => {
                  setDeploySheetError('');
                  void loadSettings({ errorTarget: 'sheet', quiet: true });
                }}
              />
            ) : null}
            <DeploySheetErrorBoundary key={deploySheetBoundaryKey}>
            {!canEdit ? (
              <p className="mb-4 text-sm text-muted-foreground">
                You can view status here. Only editors can run deploys; only owners (or admins) can change the GitHub
                connection.
              </p>
            ) : null}

            <ItemGroup className="gap-4">
              <Item variant="muted" className="w-full flex-col items-stretch gap-4">
                <ItemContent className="w-full gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Run a deploy</p>
                      <p className="text-xs text-muted-foreground">
                        {publishLastTriggerAt
                          ? `${new Date(publishLastTriggerAt).toLocaleString()}${publishLastTriggerOk === false ? ' · something went wrong' : ''}${publishLastTriggerMessage ? ` · ${publishLastTriggerMessage}` : ''}`
                          : 'No deploy started from here yet.'}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={
                        !canEdit ||
                        !canTriggerPublishWebhook ||
                        !publishDispatchReady ||
                        publishTriggering ||
                        loading
                      }
                      onClick={() => void handleTriggerPublish()}
                    >
                      {publishTriggering ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                      Run deploy now
                    </Button>
                  </div>
                  {!publishDispatchReady ? (
                    <p className="text-xs text-muted-foreground">
                      {canConfigurePublishWebhook
                        ? 'Turn builds on below and save your GitHub details first.'
                        : 'Ask a site owner to connect GitHub before you can run a deploy.'}
                    </p>
                  ) : null}
                </ItemContent>
              </Item>

              <Item variant="muted" className="w-full flex-col items-stretch gap-4">
                <ItemContent className="w-full gap-4">
                  <p className="text-sm font-medium">After the workflow finishes</p>
                  <p className="text-xs text-muted-foreground">
                    {publishLastReturnAt
                      ? `${new Date(publishLastReturnAt).toLocaleString()} · ${publishLastReturnStatus ?? '—'}`
                      : 'No completion reported yet.'}
                    {publishLastReturnRunUrl ? (
                      <>
                        {' '}
                        <a
                          href={publishLastReturnRunUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary underline underline-offset-2"
                        >
                          View on GitHub
                        </a>
                      </>
                    ) : null}
                  </p>
                  {publishWebhookPostUrl ? (
                    <p className="text-xs text-muted-foreground break-all">
                      Base ping URL (without secret): {publishWebhookPostUrl}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      To get a completion link, this API needs PUBLIC_API_BASE_URL set where it runs. You can still try
                      “Generate completion link” — if it fails, whoever hosts the CMS should set that env var.
                    </p>
                  )}
                  {canConfigurePublishWebhook ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={publishRotating}
                        onClick={() => void handleRotateReturnWebhook()}
                      >
                        {publishRotating ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                        {publishHasReturnToken ? 'New completion link' : 'Generate completion link'}
                      </Button>
                      {publishHasReturnToken ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground"
                          disabled={publishDisablingReturn}
                          onClick={() => void handleDisableReturnWebhook()}
                        >
                          Stop listening
                        </Button>
                      ) : null}
                    </div>
                  ) : publishHasReturnToken ? (
                    <p className="text-xs text-muted-foreground">Ping endpoint is set up (details hidden).</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Ask an owner to turn on completion pings.</p>
                  )}
                </ItemContent>
              </Item>

              {canConfigurePublishWebhook ? (
                <Item variant="muted" className="w-full flex-col items-stretch gap-4">
                  <ItemContent className="w-full gap-4">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="publish-enabled-sheet"
                        checked={publishEnabled}
                        onCheckedChange={(v) => setPublishEnabled(v === true)}
                        disabled={publishSaving}
                      />
                      <div className="grid gap-1.5 leading-none">
                        <label htmlFor="publish-enabled-sheet" className="text-sm font-medium">
                          Enable GitHub builds
                        </label>
                        <p className="text-xs text-muted-foreground">
                          Lets this workspace ask GitHub to start your workflow. Use a token that can reach your repo.
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-4">
                      <Field>
                        <FieldLabel>Repository</FieldLabel>
                        <FieldContent>
                          <Input
                            value={publishRepoUrl}
                            onChange={(e) => setPublishRepoUrl(e.target.value)}
                            placeholder="https://github.com/your-org/your-repo"
                            autoComplete="off"
                            disabled={publishSaving}
                          />
                          <FieldDescription>
                            Paste the repo’s GitHub URL, or shorthand like{' '}
                            <span className="font-medium text-foreground">your-org/your-repo</span>.
                          </FieldDescription>
                        </FieldContent>
                      </Field>
                      <Field>
                        <FieldLabel>Workflow trigger name</FieldLabel>
                        <FieldContent>
                          <Input
                            value={publishEventType}
                            onChange={(e) => setPublishEventType(e.target.value)}
                            placeholder="deploy_site"
                            autoComplete="off"
                            disabled={publishSaving}
                          />
                          <FieldDescription>Must match the name in your GitHub Actions workflow file.</FieldDescription>
                        </FieldContent>
                      </Field>
                      <Field>
                        <FieldLabel>Personal access token</FieldLabel>
                        <FieldContent className="space-y-2">
                          <Input
                            type="password"
                            value={publishPatDraft}
                            onChange={(e) => {
                              setPublishPatDraft(e.target.value);
                              if (e.target.value.trim()) setPublishPatClear(false);
                            }}
                            placeholder={publishHasPat ? 'Leave blank to keep the saved token' : 'Paste token'}
                            autoComplete="new-password"
                            disabled={publishSaving}
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            {publishHasPat ? (
                              <span className="text-xs text-muted-foreground">A token is saved.</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">No token saved yet.</span>
                            )}
                            {publishHasPat ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-auto py-1 text-xs"
                                disabled={publishSaving}
                                onClick={() => {
                                  setPublishPatClear(true);
                                  setPublishPatDraft('');
                                }}
                              >
                                Clear saved token
                              </Button>
                            ) : null}
                          </div>
                        </FieldContent>
                      </Field>
                    </div>

                    <Button type="button" disabled={publishSaving} onClick={() => void handleSavePublishWebhook()}>
                      {publishSaving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
                      Save connection
                    </Button>

                    <p className="text-xs text-muted-foreground">
                      <a
                        href="https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#repository_dispatch"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline underline-offset-2"
                      >
                        How this connects on GitHub
                      </a>
                    </p>
                  </ItemContent>
                </Item>
              ) : null}
            </ItemGroup>
            </DeploySheetErrorBoundary>
          </div>
        </SheetContent>
      </Sheet>

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

      <Dialog
        open={returnSetup !== null}
        onOpenChange={(o) => {
          if (!o) setReturnSetup(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Copy completion callback</DialogTitle>
            <DialogDescription>
              Shown only once. Save the whole URL as a single GitHub Actions secret (for example{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">CMS_BUILD_CALLBACK_URL</code>) — it already includes
              the signing secret. POST JSON from your workflow when the job finishes; no separate Bearer header required.
            </DialogDescription>
          </DialogHeader>
          {returnSetup ? (
            <div className="space-y-4 text-sm">
              <div>
                <p className="mb-1 font-medium">Callback URL</p>
                <div className="flex gap-2">
                  <code className="min-w-0 flex-1 break-all rounded border bg-muted px-2 py-1.5 text-xs">
                    {returnSetup.callbackUrl}
                  </code>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    aria-label="Copy callback URL"
                    onClick={() => void copyReturnField(returnSetup.callbackUrl, 'URL')}
                  >
                    <Copy className="size-4" />
                  </Button>
                </div>
              </div>
              {returnCopyHint ? <p className="text-xs text-muted-foreground">{returnCopyHint}</p> : null}
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Example (last step in bash)</p>
                <pre className="max-h-48 overflow-x-auto overflow-y-auto rounded border bg-muted p-3 text-[11px] leading-relaxed">
                  {[
                    `curl -sS -X POST "$CMS_BUILD_CALLBACK_URL" \\`,
                    `  -H "Content-Type: application/json" \\`,
                    "  -d '{\"status\":\"success\",\"runUrl\":\"'$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID'\"}'",
                  ].join('\n')}
                </pre>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
    </>
  );
}
