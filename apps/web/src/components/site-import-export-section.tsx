import { useCallback, useMemo, useRef, useState } from 'react';
import { Download, Loader2, Upload } from 'lucide-react';
import { gqlRequest } from '@/api/graphql';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Separator } from '@/components/ui/separator';

type ContentTypeRow = { id: string; name: string; slug: string };

type SiteBundlePartOptions = {
  siteSettings: boolean;
  contentTypes: boolean;
  contentTypeSlugsForEntries: string[];
  assets: boolean;
};

type BundleV1 = {
  version: number;
  exportedAt?: string;
  siteSettings?: unknown;
  contentTypes?: unknown[];
  entries?: Array<{ contentTypeSlug: string; items: unknown[] }>;
  assets?: unknown[];
};

type SiteImportSummary = {
  contentTypesUpserted: number;
  entriesCreated: number;
  entriesUpdated: number;
  assetsImported: number;
  siteSettingsApplied: boolean;
};

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function slugSetFromBundle(bundle: BundleV1 | null): Set<string> {
  const s = new Set<string>();
  if (!bundle?.entries?.length) return s;
  for (const g of bundle.entries) {
    if (g?.contentTypeSlug) s.add(String(g.contentTypeSlug));
  }
  return s;
}

export function SiteImportExportSection({
  token,
  siteId,
  siteLabel,
  contentTypes,
  onImported,
}: {
  token: string;
  siteId: string;
  siteLabel: string;
  contentTypes: ContentTypeRow[];
  onImported?: () => Promise<void>;
}) {
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [exSiteSettings, setExSiteSettings] = useState(true);
  const [exContentTypes, setExContentTypes] = useState(true);
  const [exAssets, setExAssets] = useState(false);
  const [exEntrySlugs, setExEntrySlugs] = useState<Record<string, boolean>>({});

  const importFileRef = useRef<HTMLInputElement>(null);
  const [parsedBundle, setParsedBundle] = useState<BundleV1 | null>(null);
  const [parseError, setParseError] = useState('');

  const [imSiteSettings, setImSiteSettings] = useState(true);
  const [imContentTypes, setImContentTypes] = useState(true);
  const [imAssets, setImAssets] = useState(true);
  const [imEntrySlugs, setImEntrySlugs] = useState<Record<string, boolean>>({});

  const [lastSummary, setLastSummary] = useState<SiteImportSummary | null>(null);

  const bundleEntrySlugs = useMemo(() => slugSetFromBundle(parsedBundle), [parsedBundle]);

  const initEntrySlugs = useCallback((slugs: string[], checked: boolean) => {
    const next: Record<string, boolean> = {};
    for (const s of slugs) next[s] = checked;
    return next;
  }, []);

  const openExport = useCallback(() => {
    setError('');
    const next: Record<string, boolean> = {};
    for (const ct of contentTypes) next[ct.slug] = true;
    setExEntrySlugs(next);
    setExportOpen(true);
  }, [contentTypes]);

  const openImport = useCallback(() => {
    setError('');
    setParseError('');
    setParsedBundle(null);
    setLastSummary(null);
    setImSiteSettings(true);
    setImContentTypes(true);
    setImAssets(true);
    setImEntrySlugs({});
    setImportOpen(true);
  }, []);

  const onImportFile = useCallback((file: File | undefined) => {
    setParseError('');
    setParsedBundle(null);
    setLastSummary(null);
    if (!file) return;
    void file.text().then((text) => {
      try {
        const data = JSON.parse(text) as unknown;
        if (!data || typeof data !== 'object' || Array.isArray(data) || (data as BundleV1).version !== 1) {
          setParseError('File must be a NoteCMS site bundle JSON with "version": 1.');
          return;
        }
        const b = data as BundleV1;
        setParsedBundle(b);
        const slugs = [...slugSetFromBundle(b)];
        setImEntrySlugs(initEntrySlugs(slugs, true));
      } catch {
        setParseError('Could not parse JSON.');
      }
    });
  }, [initEntrySlugs]);

  const runExport = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const contentTypeSlugsForEntries = Object.entries(exEntrySlugs)
        .filter(([, v]) => v)
        .map(([k]) => k);
      const options: SiteBundlePartOptions = {
        siteSettings: exSiteSettings,
        contentTypes: exContentTypes,
        contentTypeSlugsForEntries,
        assets: exAssets,
      };
      const res = await gqlRequest<{ exportSiteBundle: unknown }>(
        token,
        `query($siteId:ID!,$options:SiteBundlePartOptions!){ exportSiteBundle(siteId:$siteId,options:$options) }`,
        { siteId, options },
      );
      const safe = siteLabel.replace(/[^a-z0-9-_]+/gi, '-').slice(0, 48) || 'site';
      downloadJson(`notecms-export-${safe}-${new Date().toISOString().slice(0, 10)}.json`, res.exportSiteBundle);
      setExportOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  }, [token, siteId, siteLabel, exSiteSettings, exContentTypes, exAssets, exEntrySlugs]);

  const runImport = useCallback(async () => {
    if (!parsedBundle) {
      setError('Choose a valid bundle file first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const contentTypeSlugsForEntries = Object.entries(imEntrySlugs)
        .filter(([, v]) => v)
        .map(([k]) => k);
      const options: SiteBundlePartOptions = {
        siteSettings: imSiteSettings,
        contentTypes: imContentTypes,
        contentTypeSlugsForEntries,
        assets: imAssets,
      };
      const res = await gqlRequest<{ importSiteBundle: SiteImportSummary }>(
        token,
        `mutation($siteId:ID!,$bundle:JSON!,$options:SiteBundlePartOptions!){
          importSiteBundle(siteId:$siteId,bundle:$bundle,options:$options){
            contentTypesUpserted entriesCreated entriesUpdated assetsImported siteSettingsApplied
          }
        }`,
        { siteId, bundle: parsedBundle, options },
      );
      setLastSummary(res.importSiteBundle);
      await onImported?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }, [token, siteId, parsedBundle, imSiteSettings, imContentTypes, imAssets, imEntrySlugs, onImported]);

  return (
    <>
      <Separator />
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h4 className="text-base font-semibold leading-none">Import &amp; export</h4>
          <p className="text-sm text-muted-foreground">
            Plain JSON bundles for this workspace. Export is lossy for very large media; re-attach entry images after
            import if needed.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={openExport}>
            <Download data-icon="inline-start" />
            Export…
          </Button>
          <Button type="button" variant="outline" onClick={openImport}>
            <Upload data-icon="inline-start" />
            Import…
          </Button>
        </div>
      </section>

      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Export site bundle</DialogTitle>
            <DialogDescription>
              Choose what to include. Entry payloads may still reference old asset IDs from another site.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <FieldSet>
              <FieldLegend>Scope</FieldLegend>
              <FieldGroup data-slot="checkbox-group" className="gap-3">
                <Field orientation="horizontal">
                  <Checkbox
                    id="ex-ss"
                    checked={exSiteSettings}
                    onCheckedChange={(c) => setExSiteSettings(c === true)}
                  />
                  <FieldContent>
                    <FieldLabel htmlFor="ex-ss">Site settings</FieldLabel>
                    <FieldDescription>Branding fields, menus (by entry slug), logo/favicon export ids.</FieldDescription>
                  </FieldContent>
                </Field>
                <Field orientation="horizontal">
                  <Checkbox
                    id="ex-ct"
                    checked={exContentTypes}
                    onCheckedChange={(c) => setExContentTypes(c === true)}
                  />
                  <FieldContent>
                    <FieldLabel htmlFor="ex-ct">Content type definitions</FieldLabel>
                    <FieldDescription>Schemas for all types in this workspace.</FieldDescription>
                  </FieldContent>
                </Field>
                <Field orientation="horizontal">
                  <Checkbox id="ex-as" checked={exAssets} onCheckedChange={(c) => setExAssets(c === true)} />
                  <FieldContent>
                    <FieldLabel htmlFor="ex-as">Media library</FieldLabel>
                    <FieldDescription>
                      Up to 120 recent files; originals over ~4&nbsp;MB are listed without binary.
                    </FieldDescription>
                  </FieldContent>
                </Field>
              </FieldGroup>
            </FieldSet>
            <FieldSet>
              <FieldLegend>Entries by content type</FieldLegend>
              <FieldGroup data-slot="checkbox-group" className="max-h-48 gap-3 overflow-y-auto pr-1">
                {contentTypes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No content types in this site.</p>
                ) : (
                  contentTypes.map((ct) => (
                    <Field key={ct.id} orientation="horizontal">
                      <Checkbox
                        id={`ex-ent-${ct.slug}`}
                        checked={Boolean(exEntrySlugs[ct.slug])}
                        onCheckedChange={(c) =>
                          setExEntrySlugs((prev) => ({ ...prev, [ct.slug]: c === true }))
                        }
                      />
                      <FieldContent>
                        <FieldLabel htmlFor={`ex-ent-${ct.slug}`}>{ct.name}</FieldLabel>
                        <FieldDescription className="font-mono text-xs">{ct.slug}</FieldDescription>
                      </FieldContent>
                    </Field>
                  ))
                )}
              </FieldGroup>
            </FieldSet>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={() => setExportOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void runExport()} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              Download JSON
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import site bundle</DialogTitle>
            <DialogDescription>
              Merges into this workspace. Content types match by URL key; entries match by slug or name.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <input
              ref={importFileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                onImportFile(f);
              }}
            />
            <Button type="button" variant="secondary" onClick={() => importFileRef.current?.click()} disabled={busy}>
              Choose JSON file…
            </Button>
            {parseError ? <p className="text-sm text-destructive">{parseError}</p> : null}
            {parsedBundle ? (
              <>
                <Card className="border-border/80">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Bundle preview</CardTitle>
                    <CardDescription className="text-xs">
                      Exported {typeof parsedBundle.exportedAt === 'string' ? parsedBundle.exportedAt : '—'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-1 text-xs text-muted-foreground">
                    <span>Content types in file: {Array.isArray(parsedBundle.contentTypes) ? parsedBundle.contentTypes.length : 0}</span>
                    <span>Entry groups: {Array.isArray(parsedBundle.entries) ? parsedBundle.entries.length : 0}</span>
                    <span>Assets in file: {Array.isArray(parsedBundle.assets) ? parsedBundle.assets.length : 0}</span>
                    <span>Site settings block: {parsedBundle.siteSettings ? 'yes' : 'no'}</span>
                  </CardContent>
                </Card>
                <FieldSet>
                  <FieldLegend>Apply</FieldLegend>
                  <FieldGroup data-slot="checkbox-group" className="gap-3">
                    <Field orientation="horizontal">
                      <Checkbox
                        id="im-ss"
                        checked={imSiteSettings}
                        onCheckedChange={(c) => setImSiteSettings(c === true)}
                        disabled={!parsedBundle.siteSettings}
                      />
                      <FieldContent>
                        <FieldLabel htmlFor="im-ss">Site settings</FieldLabel>
                        <FieldDescription>Skipped if absent in bundle.</FieldDescription>
                      </FieldContent>
                    </Field>
                    <Field orientation="horizontal">
                      <Checkbox
                        id="im-ct"
                        checked={imContentTypes}
                        onCheckedChange={(c) => setImContentTypes(c === true)}
                        disabled={!Array.isArray(parsedBundle.contentTypes) || parsedBundle.contentTypes.length === 0}
                      />
                      <FieldContent>
                        <FieldLabel htmlFor="im-ct">Content type definitions</FieldLabel>
                      </FieldContent>
                    </Field>
                    <Field orientation="horizontal">
                      <Checkbox
                        id="im-as"
                        checked={imAssets}
                        onCheckedChange={(c) => setImAssets(c === true)}
                        disabled={!Array.isArray(parsedBundle.assets) || parsedBundle.assets.length === 0}
                      />
                      <FieldContent>
                        <FieldLabel htmlFor="im-as">Media library</FieldLabel>
                        <FieldDescription>Uploads files; needed to restore logo/favicon from bundle.</FieldDescription>
                      </FieldContent>
                    </Field>
                  </FieldGroup>
                </FieldSet>
                {bundleEntrySlugs.size ? (
                  <FieldSet>
                    <FieldLegend>Entries</FieldLegend>
                    <FieldGroup data-slot="checkbox-group" className="max-h-40 gap-3 overflow-y-auto pr-1">
                      {[...bundleEntrySlugs].sort().map((slug) => (
                        <Field key={slug} orientation="horizontal">
                          <Checkbox
                            id={`im-ent-${slug}`}
                            checked={Boolean(imEntrySlugs[slug])}
                            onCheckedChange={(c) =>
                              setImEntrySlugs((prev) => ({ ...prev, [slug]: c === true }))
                            }
                          />
                          <FieldContent>
                            <FieldLabel htmlFor={`im-ent-${slug}`}>{slug}</FieldLabel>
                          </FieldContent>
                        </Field>
                      ))}
                    </FieldGroup>
                  </FieldSet>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Select a bundle JSON to see import options.</p>
            )}
            {lastSummary ? (
              <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
                Imported: {lastSummary.contentTypesUpserted} type(s), {lastSummary.entriesCreated} new /{' '}
                {lastSummary.entriesUpdated} updated entries, {lastSummary.assetsImported} asset(s).
                {lastSummary.siteSettingsApplied ? ' Site settings updated.' : ''}
              </p>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={() => setImportOpen(false)} disabled={busy}>
              Close
            </Button>
            <Button type="button" onClick={() => void runImport()} disabled={busy || !parsedBundle}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              Run import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
