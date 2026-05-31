import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Rocket, Save, Trash2 } from 'lucide-react';
import { gqlRequest } from '@/api/graphql';
import { DeploySheetErrorBoundary } from '@/components/deploy-sheet-error-boundary';
import { LoadErrorAlert } from '@/components/load-error-alert';
import {
  buildStatusLine,
  canTriggerBuild,
  fetchSiteBuilds,
  SITE_BUILD_GQL_FIELDS,
  triggerSiteBuildRequest,
  type SiteBuildGql,
} from '@/lib/site-builds';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Item, ItemContent, ItemGroup } from '@/components/ui/item';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { toast } from 'sonner';

type SiteBuildsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  siteId: string;
  siteRole?: string;
  isGlobalAdmin?: boolean;
  onBuildsChanged?: () => void | Promise<void>;
};

export function SiteBuildsSheet({
  open,
  onOpenChange,
  token,
  siteId,
  siteRole,
  isGlobalAdmin = false,
  onBuildsChanged,
}: SiteBuildsSheetProps) {
  const canConfigure = isGlobalAdmin || siteRole === 'owner';
  const canEdit = siteRole === 'owner' || siteRole === 'editor' || isGlobalAdmin;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [boundaryKey, setBoundaryKey] = useState(0);
  const [builds, setBuilds] = useState<SiteBuildGql[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyBuildId, setBusyBuildId] = useState<string | null>(null);

  const [formEnabled, setFormEnabled] = useState(false);
  const [formRepoUrl, setFormRepoUrl] = useState('');
  const [formEventType, setFormEventType] = useState('');
  const [formTriggerRole, setFormTriggerRole] = useState<'editor' | 'owner'>('editor');
  const [formPatDraft, setFormPatDraft] = useState('');
  const [formPatClear, setFormPatClear] = useState(false);
  const [formHasPat, setFormHasPat] = useState(false);
  const [formSaving, setFormSaving] = useState(false);
  const [formRotating, setFormRotating] = useState(false);
  const [formDisablingReturn, setFormDisablingReturn] = useState(false);
  const [returnSetup, setReturnSetup] = useState<{ callbackUrl: string; buildId: string } | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createSlug, setCreateSlug] = useState('');
  const [createLabel, setCreateLabel] = useState('');
  const [createBusy, setCreateBusy] = useState(false);

  const selected = useMemo(
    () => builds.find((b) => b.id === selectedId) ?? builds[0] ?? null,
    [builds, selectedId],
  );

  const loadBuilds = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    setError('');
    try {
      const list = await fetchSiteBuilds(token, siteId);
      setBuilds(list);
      setSelectedId((prev) => {
        if (prev && list.some((b) => b.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
      await onBuildsChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load builds');
    } finally {
      setLoading(false);
    }
  }, [token, siteId, onBuildsChanged]);

  useEffect(() => {
    if (!open) return;
    setBoundaryKey((k) => k + 1);
    void loadBuilds();
  }, [open, loadBuilds]);

  useEffect(() => {
    if (!selected) return;
    setFormEnabled(selected.enabled);
    setFormRepoUrl(selected.publishGithubRepoUrl ?? '');
    setFormEventType(selected.publishEventType ?? '');
    setFormTriggerRole(selected.triggerMinRole);
    setFormHasPat(selected.hasPublishPat);
    setFormPatDraft('');
    setFormPatClear(false);
  }, [selected]);

  async function handleTrigger(build: SiteBuildGql) {
    setBusyBuildId(build.id);
    setError('');
    try {
      const result = await triggerSiteBuildRequest(token, siteId, build.id);
      if (result.ok) toast.success(`${build.label} deploy started`);
      else toast.error(result.message || 'Could not start deploy');
      await loadBuilds();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to trigger build');
    } finally {
      setBusyBuildId(null);
    }
  }

  async function handleSaveSelected() {
    if (!selected || !canConfigure) return;
    setFormSaving(true);
    setError('');
    try {
      const input: Record<string, unknown> = {
        enabled: formEnabled,
        githubRepoUrl: formRepoUrl.trim(),
        publishEventType: formEventType.trim() || null,
        triggerMinRole: formTriggerRole,
      };
      if (formPatClear) input.githubPat = '';
      else if (formPatDraft.trim()) input.githubPat = formPatDraft.trim();

      await gqlRequest(
        token,
        `mutation($siteId:ID!,$id:ID!,$input:SiteBuildInput!){
          updateSiteBuild(siteId:$siteId,id:$id,input:$input){ ${SITE_BUILD_GQL_FIELDS} }
        }`,
        { siteId, id: selected.id, input },
      );
      await loadBuilds();
      toast.success('Build settings saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save build');
    } finally {
      setFormSaving(false);
    }
  }

  async function handleRotateReturn() {
    if (!selected || !canConfigure) return;
    setFormRotating(true);
    setError('');
    try {
      const res = await gqlRequest<{ rotateSiteBuildReturnWebhook: { callbackUrl: string } }>(
        token,
        `mutation($siteId:ID!,$id:ID!){ rotateSiteBuildReturnWebhook(siteId:$siteId,id:$id){ callbackUrl } }`,
        { siteId, id: selected.id },
      );
      setReturnSetup({ callbackUrl: res.rotateSiteBuildReturnWebhook.callbackUrl, buildId: selected.id });
      await loadBuilds();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate callback');
    } finally {
      setFormRotating(false);
    }
  }

  async function handleDisableReturn() {
    if (!selected || !canConfigure) return;
    if (
      !window.confirm(
        'Disable the build completion callback? GitHub workflow secrets using this link will stop working until you generate a new one.',
      )
    ) {
      return;
    }
    setFormDisablingReturn(true);
    setError('');
    try {
      await gqlRequest(
        token,
        `mutation($siteId:ID!,$id:ID!){ disableSiteBuildReturnWebhook(siteId:$siteId,id:$id){ id } }`,
        { siteId, id: selected.id },
      );
      await loadBuilds();
      toast.success('Callback disabled');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to disable callback');
    } finally {
      setFormDisablingReturn(false);
    }
  }

  async function handleDelete(build: SiteBuildGql) {
    if (!canConfigure) return;
    if (!window.confirm(`Remove the "${build.label}" build? This cannot be undone.`)) return;
    setBusyBuildId(build.id);
    setError('');
    try {
      await gqlRequest(token, `mutation($siteId:ID!,$id:ID!){ deleteSiteBuild(siteId:$siteId,id:$id) }`, {
        siteId,
        id: build.id,
      });
      await loadBuilds();
      toast.success('Build removed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove build');
    } finally {
      setBusyBuildId(null);
    }
  }

  async function handleCreate() {
    if (!canConfigure) return;
    setCreateBusy(true);
    setError('');
    try {
      const created = await gqlRequest<{ createSiteBuild: SiteBuildGql }>(
        token,
        `mutation($siteId:ID!,$input:CreateSiteBuildInput!){
          createSiteBuild(siteId:$siteId,input:$input){ ${SITE_BUILD_GQL_FIELDS} }
        }`,
        {
          siteId,
          input: {
            slug: createSlug.trim().toLowerCase(),
            label: createLabel.trim(),
            enabled: false,
            triggerMinRole: 'editor',
          },
        },
      );
      setCreateOpen(false);
      setCreateSlug('');
      setCreateLabel('');
      await loadBuilds();
      setSelectedId(created.createSiteBuild.id);
      toast.success('Build added');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add build');
    } finally {
      setCreateBusy(false);
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="flex h-[100dvh] max-h-[100dvh] w-full flex-col gap-0 overflow-hidden border-0 p-0 shadow-xl sm:max-w-md md:max-w-lg"
        >
          <SheetHeader className="shrink-0 space-y-1 border-b border-border px-6 py-5 text-left">
            <SheetTitle>Site builds</SheetTitle>
            <SheetDescription className="text-pretty">
              Connect GitHub workflows for live, staging, or other deploy targets. Owners configure builds; who can run
              each one depends on the role you set.
            </SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-6">
            {error ? (
              <LoadErrorAlert
                className="mb-4"
                title="Builds"
                message={error}
                onRetry={() => {
                  setError('');
                  void loadBuilds();
                }}
              />
            ) : null}
            <DeploySheetErrorBoundary key={boundaryKey}>
              {!canEdit ? (
                <p className="mb-4 text-sm text-muted-foreground">You can view build status here.</p>
              ) : null}

              {canConfigure ? (
                <div className="mb-4">
                  <Button type="button" variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
                    <Plus className="mr-2 size-4" />
                    Add build
                  </Button>
                </div>
              ) : null}

              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading builds…
                </div>
              ) : builds.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {canConfigure
                    ? 'No builds yet. Add one for live, staging, or any GitHub workflow you want to trigger from here.'
                    : 'No builds set up yet. Ask a site owner to connect GitHub.'}
                </p>
              ) : (
                <ItemGroup className="gap-4">
                  {builds.map((build) => {
                    const isSelected = selected?.id === build.id;
                    const canRun = canTriggerBuild(build, siteRole, isGlobalAdmin);
                    return (
                      <Item
                        key={build.id}
                        variant="muted"
                        className={`w-full flex-col items-stretch gap-3 ${isSelected ? 'ring-2 ring-primary/30' : ''}`}
                      >
                        <ItemContent className="w-full gap-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <button
                              type="button"
                              className="min-w-0 flex-1 text-left"
                              onClick={() => setSelectedId(build.id)}
                            >
                              <p className="text-sm font-medium text-foreground">{build.label}</p>
                              <p className="text-xs text-muted-foreground">
                                {build.slug}
                                {build.triggerMinRole === 'owner' ? ' · owners only' : ' · editors and owners'}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">{buildStatusLine(build)}</p>
                            </button>
                            <div className="flex shrink-0 items-center gap-1">
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                disabled={!canRun || busyBuildId === build.id}
                                onClick={() => void handleTrigger(build)}
                              >
                                {busyBuildId === build.id ? (
                                  <Loader2 className="mr-2 size-4 animate-spin" />
                                ) : (
                                  <Rocket className="mr-2 size-4" />
                                )}
                                Run
                              </Button>
                              {canConfigure ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  className="text-muted-foreground hover:text-destructive"
                                  disabled={busyBuildId === build.id}
                                  aria-label={`Remove ${build.label}`}
                                  onClick={() => void handleDelete(build)}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              ) : null}
                            </div>
                          </div>

                          {isSelected && canConfigure ? (
                            <div className="space-y-4 border-t border-border/60 pt-4">
                              <div className="flex items-start gap-3">
                                <Checkbox
                                  id={`build-enabled-${build.id}`}
                                  checked={formEnabled}
                                  onCheckedChange={(v) => setFormEnabled(v === true)}
                                  disabled={formSaving}
                                />
                                <div className="grid gap-1 leading-none">
                                  <label htmlFor={`build-enabled-${build.id}`} className="text-sm font-medium">
                                    Enabled
                                  </label>
                                  <p className="text-xs text-muted-foreground">
                                    When off, nobody can trigger this build from NoteCMS.
                                  </p>
                                </div>
                              </div>

                              <Field>
                                <FieldLabel>Who can run this build</FieldLabel>
                                <FieldContent>
                                  <Select
                                    value={formTriggerRole}
                                    onValueChange={(v) => setFormTriggerRole(v as 'editor' | 'owner')}
                                    disabled={formSaving}
                                  >
                                    <SelectTrigger className="w-full">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="editor">Editors and owners</SelectItem>
                                      <SelectItem value="owner">Owners only</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FieldDescription>
                                    Use owners only for production; editors can usually run staging.
                                  </FieldDescription>
                                </FieldContent>
                              </Field>

                              <Field>
                                <FieldLabel>Repository</FieldLabel>
                                <FieldContent>
                                  <Input
                                    value={formRepoUrl}
                                    onChange={(e) => setFormRepoUrl(e.target.value)}
                                    placeholder="https://github.com/your-org/your-repo"
                                    autoComplete="off"
                                    disabled={formSaving}
                                  />
                                </FieldContent>
                              </Field>

                              <Field>
                                <FieldLabel>Workflow trigger name</FieldLabel>
                                <FieldContent>
                                  <Input
                                    value={formEventType}
                                    onChange={(e) => setFormEventType(e.target.value)}
                                    placeholder="deploy_site"
                                    autoComplete="off"
                                    disabled={formSaving}
                                  />
                                </FieldContent>
                              </Field>

                              <Field>
                                <FieldLabel>Personal access token</FieldLabel>
                                <FieldContent className="space-y-2">
                                  <Input
                                    type="password"
                                    value={formPatDraft}
                                    onChange={(e) => {
                                      setFormPatDraft(e.target.value);
                                      if (e.target.value.trim()) setFormPatClear(false);
                                    }}
                                    placeholder={formHasPat ? 'Leave blank to keep saved token' : 'Paste token'}
                                    autoComplete="new-password"
                                    disabled={formSaving}
                                  />
                                  {formHasPat ? (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-auto py-1 text-xs"
                                      disabled={formSaving}
                                      onClick={() => {
                                        setFormPatClear(true);
                                        setFormPatDraft('');
                                      }}
                                    >
                                      Clear saved token
                                    </Button>
                                  ) : null}
                                </FieldContent>
                              </Field>

                              <Button type="button" disabled={formSaving} onClick={() => void handleSaveSelected()}>
                                {formSaving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
                                Save build
                              </Button>

                              <div className="space-y-2 border-t border-border/60 pt-4">
                                <p className="text-sm font-medium">After the workflow finishes</p>
                                <p className="text-xs text-muted-foreground">
                                  Each Run sends a one-time completion URL in the GitHub payload as{' '}
                                  <span className="font-mono">buildCallbackUrl</span>. Your workflow can POST to that when
                                  it finishes — no manual secret needed.
                                </p>
                                {build.publishLastReturnRunUrl ? (
                                  <a
                                    href={build.publishLastReturnRunUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-primary underline underline-offset-2"
                                  >
                                    View last run on GitHub
                                  </a>
                                ) : null}
                                {build.publishWebhookPostUrl ? (
                                  <p className="text-xs text-muted-foreground break-all">
                                    Callback base (legacy): {build.publishWebhookPostUrl}
                                  </p>
                                ) : null}
                                <details className="text-xs text-muted-foreground">
                                  <summary className="cursor-pointer select-none">Optional: static completion link</summary>
                                  <div className="mt-2 space-y-2">
                                    <p>
                                      Only needed if your workflow cannot read{' '}
                                      <span className="font-mono">github.event.client_payload.buildCallbackUrl</span>.
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={formRotating}
                                        onClick={() => void handleRotateReturn()}
                                      >
                                        {formRotating ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                                        {build.hasPublishReturnToken ? 'New static link' : 'Generate static link'}
                                      </Button>
                                      {build.hasPublishReturnToken ? (
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          className="text-muted-foreground"
                                          disabled={formDisablingReturn}
                                          onClick={() => void handleDisableReturn()}
                                        >
                                          Stop listening
                                        </Button>
                                      ) : null}
                                    </div>
                                    {returnSetup?.buildId === build.id ? (
                                      <div className="space-y-2">
                                        <p className="rounded-md bg-muted/60 p-2 font-mono text-xs break-all">
                                          {returnSetup.callbackUrl}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                          GitHub must POST to this URL when the workflow finishes. Opening it in a browser
                                          will not work.
                                        </p>
                                      </div>
                                    ) : null}
                                  </div>
                                </details>
                              </div>
                            </div>
                          ) : null}
                        </ItemContent>
                      </Item>
                    );
                  })}
                </ItemGroup>
              )}
            </DeploySheetErrorBoundary>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add build</DialogTitle>
            <DialogDescription>
              Give it a short name and an id for GitHub workflows. Example: Live / production, Staging / staging.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field>
              <FieldLabel>Name</FieldLabel>
              <FieldContent>
                <Input
                  value={createLabel}
                  onChange={(e) => setCreateLabel(e.target.value)}
                  placeholder="Staging"
                  autoComplete="off"
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel>Build id</FieldLabel>
              <FieldContent>
                <Input
                  value={createSlug}
                  onChange={(e) => setCreateSlug(e.target.value)}
                  placeholder="staging"
                  autoComplete="off"
                  spellCheck={false}
                />
                <FieldDescription>Lowercase letters, numbers, hyphens. Sent to GitHub in the workflow payload.</FieldDescription>
              </FieldContent>
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={createBusy || !createLabel.trim() || !createSlug.trim()}
              onClick={() => void handleCreate()}
            >
              {createBusy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Add build
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export type { SiteBuildGql } from '@/lib/site-builds';
export { buildsSummaryFromList, fetchSiteBuilds } from '@/lib/site-builds';
