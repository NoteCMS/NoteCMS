import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, PointerEvent } from 'react';
import { Crosshair, Ellipsis, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { gqlRequest } from '@/api/graphql';
import { LoadErrorAlert } from '@/components/load-error-alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { buildPageTitle, useDocumentTitle } from '@/lib/page-title';
import { assetGalleryLabels } from '@/lib/asset-gallery';
import { clamp01, focalToObjectPosition } from '@/lib/focal-point';
import { cn } from '@/lib/utils';
import type { Asset, Site } from '@/types/app';

const ASSET_LIST_GQL = `id siteId uploadedBy filename mimeType sizeBytes width height alt title focalPoint { x y } variants { original web thumbnail small medium large xlarge } createdAt updatedAt`;

type AssetsPageProps = {
  token: string;
  workspaceSiteId: string;
  sites: Site[];
};

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function AssetsPage({ token, workspaceSiteId, sites }: AssetsPageProps) {
  const siteTitle = sites.find((s) => s.id === workspaceSiteId)?.name?.trim() || 'Workspace';
  useDocumentTitle(buildPageTitle('Assets', siteTitle));
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [error, setError] = useState('');
  const [dropActive, setDropActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [focalEditorAsset, setFocalEditorAsset] = useState<Asset | null>(null);
  const [focalDraft, setFocalDraft] = useState({ x: 0.5, y: 0.5 });
  const [focalSaving, setFocalSaving] = useState(false);
  const focalPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(id);
  }, [search]);

  const loadAssets = useCallback(async () => {
    if (!workspaceSiteId) return;
    setIsLoading(true);
    setError('');
    try {
      const response = await gqlRequest<{ listAssets: Asset[] }>(
        token,
        `query($siteId:ID!,$query:String){ listAssets(siteId:$siteId,query:$query){ ${ASSET_LIST_GQL} } }`,
        { siteId: workspaceSiteId, query: debouncedSearch || undefined },
      );
      setAssets(response.listAssets);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load assets');
    } finally {
      setIsLoading(false);
    }
  }, [token, workspaceSiteId, debouncedSearch]);

  useEffect(() => {
    if (!workspaceSiteId) {
      setAssets([]);
      return;
    }
    void loadAssets();
  }, [workspaceSiteId, loadAssets]);

  async function uploadFile(file: File | undefined) {
    if (!file || !workspaceSiteId) return;

    setIsUploading(true);
    setError('');
    try {
      const fileBase64 = await fileToBase64(file);
      await gqlRequest(
        token,
        'mutation($siteId:ID!,$fileBase64:String!,$filename:String!,$mimeType:String!){ uploadAsset(siteId:$siteId,fileBase64:$fileBase64,filename:$filename,mimeType:$mimeType){ id } }',
        {
          siteId: workspaceSiteId,
          fileBase64,
          filename: file.name,
          mimeType: file.type,
        },
      );
      await loadAssets();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Failed to upload asset');
    } finally {
      setIsUploading(false);
    }
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    await uploadFile(file);
  }

  async function handleDelete(assetId: string) {
    if (!workspaceSiteId) return;
    setError('');
    try {
      await gqlRequest(token, 'mutation($id:ID!,$siteId:ID!){ deleteAsset(id:$id,siteId:$siteId) }', {
        id: assetId,
        siteId: workspaceSiteId,
      });
      await loadAssets();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete asset');
    }
  }

  function onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setDropActive(true);
  }

  function onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setDropActive(false);
  }

  useEffect(() => {
    if (focalEditorAsset) setFocalDraft(focalEditorAsset.focalPoint);
  }, [focalEditorAsset]);

  function setFocalFromPointer(event: PointerEvent<HTMLDivElement>) {
    const el = focalPickerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    setFocalDraft({
      x: clamp01((event.clientX - r.left) / r.width),
      y: clamp01((event.clientY - r.top) / r.height),
    });
  }

  async function saveFocalPoint() {
    if (!workspaceSiteId || !focalEditorAsset) return;
    setFocalSaving(true);
    setError('');
    try {
      await gqlRequest(
        token,
        `mutation($id:ID!,$siteId:ID!,$focalX:Float!,$focalY:Float!){ updateAssetMeta(id:$id,siteId:$siteId,focalX:$focalX,focalY:$focalY){ ${ASSET_LIST_GQL} } }`,
        {
          id: focalEditorAsset.id,
          siteId: workspaceSiteId,
          focalX: focalDraft.x,
          focalY: focalDraft.y,
        },
      );
      setFocalEditorAsset(null);
      await loadAssets();
    } catch (focalError) {
      setError(focalError instanceof Error ? focalError.message : 'Failed to save focal point');
    } finally {
      setFocalSaving(false);
    }
  }

  async function onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setDropActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file && !file.type.startsWith('image/')) {
      setError('Please drop an image file.');
      return;
    }
    await uploadFile(file);
  }

  const showEmptyHint = workspaceSiteId && !isLoading && assets.length === 0 && !search.trim();
  const showNoResults =
    workspaceSiteId && !isLoading && assets.length === 0 && Boolean(search.trim());

  return (
    <>
    <Card className="w-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold tracking-tight">Assets</CardTitle>
        <CardDescription>Browse, upload, and remove images for this workspace.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-0">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by filename…"
            className="h-9 max-w-md flex-1"
            name="asset-search"
            aria-label="Search assets"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0"
            onClick={() => void loadAssets()}
            disabled={isLoading || !workspaceSiteId}
          >
            Refresh
          </Button>
        </div>
        {showEmptyHint ? (
          <p className="text-xs leading-snug text-muted-foreground" role="status">
            This workspace has no assets yet. Use the <span className="font-medium text-foreground/80">+</span> tile below to
            upload.
          </p>
        ) : showNoResults ? (
          <p className="text-xs leading-snug text-muted-foreground" role="status">
            No results for{' '}
            <span className="font-medium text-foreground/90">{`\u201c${search.trim()}\u201d`}</span>. Adjust your search or add a
            file with the + tile.
          </p>
        ) : null}
      </div>

      {error ? (
        <LoadErrorAlert title="Assets couldn't load" message={error} onRetry={() => void loadAssets()} />
      ) : null}

      {!workspaceSiteId ? (
        <p className="text-sm text-muted-foreground">Select a workspace from the sidebar first.</p>
      ) : (
        <div className="rounded-xl border border-border/50 bg-muted/10 p-2">
          {isLoading && assets.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">Loading assets…</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <input
                ref={fileInputRef}
                id="asset-upload"
                type="file"
                accept="image/*"
                className="sr-only"
                aria-label="Upload new image"
                disabled={isUploading}
                onChange={handleUpload}
              />
              <div
                className={cn(
                  'flex flex-col overflow-hidden rounded-xl border border-dashed bg-card/50 text-left transition-colors',
                  dropActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/35',
                  isUploading && 'pointer-events-none opacity-70',
                )}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={(event) => void onDrop(event)}
              >
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    'flex w-full flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    'hover:border-primary/45',
                  )}
                >
                  <div className="relative flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 bg-muted/30">
                    {isUploading ? (
                      <span className="text-xs font-medium text-muted-foreground">Uploading…</span>
                    ) : (
                      <>
                        <span className="flex size-11 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/40 bg-background/80 text-muted-foreground">
                          <Plus className="size-5" aria-hidden />
                        </span>
                        <span className="px-2 text-center text-[11px] font-medium text-muted-foreground">Add image</span>
                      </>
                    )}
                  </div>
                  <div className="flex min-h-[2.75rem] flex-col justify-center border-t border-border/60 px-2.5 py-2">
                    <span className="text-xs font-medium text-foreground">Upload new</span>
                    <span className="truncate text-[10px] text-muted-foreground">Click or drop a file</span>
                  </div>
                </button>
              </div>

              {assets.map((asset) => {
                const { primary, hint, title } = assetGalleryLabels(asset);
                return (
                  <div
                    key={asset.id}
                    className="flex flex-col overflow-hidden rounded-xl border border-border/80 bg-card text-left"
                  >
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
                      <img
                        src={asset.variants.thumbnail}
                        alt={asset.alt || primary}
                        title={title}
                        className="size-full object-cover"
                        style={{ objectPosition: focalToObjectPosition(asset.focalPoint) }}
                        loading="lazy"
                      />
                    </div>
                    <div className="border-t border-border/60 px-2.5 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-xs font-medium leading-snug text-foreground">{primary}</p>
                          {hint ? (
                            <p className="truncate font-mono text-[10px] text-muted-foreground" title={asset.filename}>
                              {hint}
                            </p>
                          ) : null}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
                              aria-label="Asset options"
                            >
                              <Ellipsis className="size-3.5" aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuGroup>
                              <DropdownMenuItem onSelect={() => setFocalEditorAsset(asset)}>
                                <Crosshair className="size-3.5" aria-hidden />
                                Focal point
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => {
                                  window.open(asset.variants.original, '_blank', 'noopener,noreferrer');
                                }}
                              >
                                <ExternalLink className="size-3.5" aria-hidden />
                                Open original
                              </DropdownMenuItem>
                              <DropdownMenuItem variant="destructive" onSelect={() => void handleDelete(asset.id)}>
                                <Trash2 className="size-3.5" aria-hidden />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      </CardContent>
    </Card>

      <Dialog open={Boolean(focalEditorAsset)} onOpenChange={(open) => !open && setFocalEditorAsset(null)}>
        <DialogContent className="flex max-h-[92vh] max-w-[min(96vw,72rem)] flex-col gap-4 overflow-hidden p-4 sm:max-w-[min(96vw,72rem)] sm:p-6">
          <DialogHeader>
            <DialogTitle>Focal point</DialogTitle>
            <DialogDescription>
              Click or drag on the image. The preview shows the whole image; the marker is where the site should anchor{' '}
              <span className="font-mono text-xs">object-fit: cover</span> crops (
              <span className="font-mono text-xs">
                {Math.round(focalDraft.x * 100)}% {Math.round(focalDraft.y * 100)}%
              </span>
              ).
            </DialogDescription>
          </DialogHeader>
          {focalEditorAsset ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="flex min-h-0 w-full flex-1 items-center justify-center rounded-xl border border-border/60 bg-muted/40 p-2 sm:p-4">
                <div
                  ref={focalPickerRef}
                  className="relative max-h-full max-w-full cursor-crosshair touch-none select-none"
                  onPointerDown={(e) => {
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    setFocalFromPointer(e);
                  }}
                  onPointerMove={(e) => {
                    if (!focalPickerRef.current?.hasPointerCapture(e.pointerId)) return;
                    setFocalFromPointer(e);
                  }}
                  onPointerUp={(e) => focalPickerRef.current?.releasePointerCapture(e.pointerId)}
                  onPointerCancel={(e) => focalPickerRef.current?.releasePointerCapture(e.pointerId)}
                >
                  <img
                    src={focalEditorAsset.variants.medium ?? focalEditorAsset.variants.large}
                    alt=""
                    className="pointer-events-none block h-auto max-h-[min(62vh,40rem)] max-w-full w-auto object-contain"
                    draggable={false}
                  />
                  <span
                    className="pointer-events-none absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-primary bg-background/90 shadow-md ring-2 ring-background"
                    style={{ left: `${focalDraft.x * 100}%`, top: `${focalDraft.y * 100}%` }}
                    aria-hidden
                  >
                    <Crosshair className="size-3.5 text-primary" />
                  </span>
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => setFocalDraft({ x: 0.5, y: 0.5 })}>
              Center
            </Button>
            <Button type="button" variant="outline" onClick={() => setFocalEditorAsset(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={focalSaving || !focalEditorAsset} onClick={() => void saveFocalPoint()}>
              {focalSaving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
