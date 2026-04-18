import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, ChevronDown, Copy, Ellipsis, Globe, Images, Plus, Trash2, Upload } from 'lucide-react';
import { gqlRequest } from '@/api/graphql';
import { useUnsavedChangesPrompt } from '@/hooks/use-unsaved-changes-prompt';
import { stableJsonStringify } from '@/lib/stable-json';
import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Combobox } from '@/components/ui/combobox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Dropzone, DropZoneArea, DropzoneMessage, DropzoneTrigger, useDropzone } from '@/components/ui/dropzone';
import { Field, FieldContent, FieldGroup, FieldLabel } from '@/components/ui/field';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
import { Item, ItemContent } from '@/components/ui/item';
import { Label } from '@/components/ui/label';
import { MarkdownEditor } from '@/components/ui/markdown-editor';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { assetGalleryLabels } from '@/lib/asset-gallery';
import { focalToObjectPosition } from '@/lib/focal-point';
import { cn } from '@/lib/utils';
import type { Asset, ConditionOperator, ContentField, ContentType, Entry, ImageFieldValue, Site, VisibilityConfig } from '@/types/app';
import { useNavigate } from 'react-router-dom';

type EntriesPageProps = {
  token: string;
  workspaceSiteId: string;
  sites: Site[];
  forcedContentTypeSlug?: string;
  entryId?: string;
};

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function getRuleValue(data: Record<string, unknown>, key: string): unknown {
  if (!key) return undefined;
  return key.split('.').reduce<unknown>((acc, part) => {
    if (!acc || typeof acc !== 'object' || Array.isArray(acc)) return undefined;
    return (acc as Record<string, unknown>)[part];
  }, data);
}

function matchRule(operator: ConditionOperator, left: unknown, right?: string): boolean {
  switch (operator) {
    case 'equals':
      return String(left ?? '') === String(right ?? '');
    case 'not_equals':
      return String(left ?? '') !== String(right ?? '');
    case 'contains':
      return String(left ?? '').toLowerCase().includes(String(right ?? '').toLowerCase());
    case 'not_contains':
      return !String(left ?? '').toLowerCase().includes(String(right ?? '').toLowerCase());
    case 'is_empty':
      return left === undefined || left === null || left === '';
    case 'is_not_empty':
      return !(left === undefined || left === null || left === '');
    case 'gt':
      return Number(left) > Number(right ?? 0);
    case 'lt':
      return Number(left) < Number(right ?? 0);
    default:
      return true;
  }
}

function shouldShowField(field: ContentField, data: Record<string, unknown>): boolean {
  const visibility = field.config?.visibility as VisibilityConfig | undefined;
  if (!visibility || !visibility.groups?.length) return true;

  const evaluateGroup = (group: VisibilityConfig['groups'][number]) => {
    const results = group.rules.map((rule) => matchRule(rule.operator, getRuleValue(data, rule.fieldKey), rule.value));
    return group.relation === 'all' ? results.every(Boolean) : results.some(Boolean);
  };

  const groupResults = visibility.groups.map(evaluateGroup);
  return visibility.relation === 'all' ? groupResults.every(Boolean) : groupResults.some(Boolean);
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

function formatRowSummaryValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.length ? `${value.length} item${value.length === 1 ? '' : 's'}` : '';
  if (typeof value === 'object') return '';
  return '';
}

type FieldListProps = {
  token: string;
  siteId: string;
  assets: Asset[];
  contentTypeFieldMap: Map<string, ContentField[]>;
  internalUrlSuggestionGroups: Array<{ label: string; options: Array<{ value: string; label: string }> }>;
  onAssetsChanged: () => Promise<void>;
  fields: ContentField[];
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
};

/** Keyed by asset so `useDropzone` internal file state resets between selections (registry dropzone keeps a file list). */
function ImageFieldDropzonePreview({
  fieldId,
  previewUrl,
  selectedAsset,
  uploadAsset,
  onUploaded,
}: {
  fieldId: string;
  previewUrl: string | undefined;
  selectedAsset: Asset | undefined;
  uploadAsset: (file: File) => Promise<Asset>;
  onUploaded: (asset: Asset) => void;
}) {
  const imageDropzone = useDropzone<Asset, string>({
    validation: {
      accept: { 'image/*': [] },
      maxFiles: 1,
      maxSize: 25 * 1024 * 1024,
    },
    onDropFile: useCallback(
      async (file) => {
        try {
          const asset = await uploadAsset(file);
          onUploaded(asset);
          return { status: 'success' as const, result: asset };
        } catch (error) {
          return {
            status: 'error' as const,
            error: error instanceof Error ? error.message : 'Upload failed',
          };
        }
      },
      [uploadAsset, onUploaded],
    ),
  });

  return (
    <Dropzone {...imageDropzone}>
      <DropZoneArea
        className={cn(
          'relative size-24 shrink-0 overflow-hidden rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/40 p-0 ring-offset-background',
          imageDropzone.isDragActive && 'animate-pulse border-primary bg-primary/10',
          previewUrl && 'border-solid border-input',
        )}
      >
        <DropzoneTrigger
          id={fieldId}
          className="flex size-full cursor-pointer flex-col items-center justify-center rounded-[10px] border-0 bg-transparent p-0 shadow-none hover:bg-transparent has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring has-[input:focus-visible]:ring-offset-2"
        >
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={selectedAsset?.alt || selectedAsset?.filename || ''}
              className="pointer-events-none size-full object-cover"
              style={{ objectPosition: focalToObjectPosition(selectedAsset?.focalPoint) }}
              loading="lazy"
            />
          ) : (
            <span className="flex flex-col items-center gap-1 px-1">
              <Upload className="size-5 text-muted-foreground" aria-hidden />
              <span className="text-[10px] leading-tight font-medium text-muted-foreground">Upload</span>
            </span>
          )}
        </DropzoneTrigger>
      </DropZoneArea>
      <DropzoneMessage className="min-h-0 text-[10px] leading-tight break-words text-destructive" />
    </Dropzone>
  );
}

function ImageFieldInput({
  fieldId,
  value,
  assets,
  onImageChange,
  uploadAsset,
}: {
  fieldId: string;
  value: Partial<ImageFieldValue>;
  assets: Asset[];
  onImageChange: (next: Partial<ImageFieldValue>) => void;
  uploadAsset: (file: File) => Promise<Asset>;
}) {
  const [browserOpen, setBrowserOpen] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState('');
  /** Highlight inside the library dialog before confirming with Select. */
  const [libraryPickId, setLibraryPickId] = useState('');
  const [libraryUploading, setLibraryUploading] = useState(false);
  const [libraryDropActive, setLibraryDropActive] = useState(false);
  const libraryFileInputRef = useRef<HTMLInputElement>(null);

  const handleLibraryNewFile = useCallback(
    async (file: File | undefined) => {
      if (!file || !file.type.startsWith('image/')) return;
      setLibraryUploading(true);
      try {
        const asset = await uploadAsset(file);
        setLibraryPickId(asset.id);
      } finally {
        setLibraryUploading(false);
      }
    },
    [uploadAsset],
  );

  const selectedAsset = assets.find((a) => a.id === value.assetId);
  const previewUrl = selectedAsset?.variants.thumbnail;

  const filteredLibrary = useMemo(() => {
    const q = libraryQuery.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter((a) => a.filename.toLowerCase().includes(q) || a.title.toLowerCase().includes(q));
  }, [assets, libraryQuery]);

  const onUploaded = useCallback(
    (asset: Asset) => {
      onImageChange({ assetId: asset.id });
    },
    [onImageChange],
  );

  return (
    <div className="flex flex-wrap items-start gap-3">
      <div className="flex w-24 shrink-0 flex-col gap-1">
        <ImageFieldDropzonePreview
          key={`${fieldId}-${value.assetId ?? 'none'}`}
          fieldId={fieldId}
          previewUrl={previewUrl}
          selectedAsset={selectedAsset}
          uploadAsset={uploadAsset}
          onUploaded={onUploaded}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setBrowserOpen(true)}>
            <Images className="size-3.5" aria-hidden />
            Library
          </Button>
          {value.assetId ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-muted-foreground"
              onClick={() => onImageChange({ assetId: '' })}
            >
              Clear
            </Button>
          ) : null}
        </div>
        {selectedAsset ? (
          <p className="truncate text-xs text-muted-foreground" title={selectedAsset.filename}>
            {selectedAsset.filename}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">No image.</p>
        )}
      </div>

      <Dialog
        open={browserOpen}
        onOpenChange={(open) => {
          setBrowserOpen(open);
          if (!open) {
            setLibraryQuery('');
            setLibraryDropActive(false);
            return;
          }
          setLibraryPickId(value.assetId ?? '');
        }}
      >
        <DialogContent className="flex max-h-[85vh] flex-col gap-4 overflow-hidden p-4 sm:max-w-3xl">
          <DialogHeader className="space-y-1">
            <DialogTitle>Choose asset</DialogTitle>
            <DialogDescription>
              Select an image to continue.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Input
              value={libraryQuery}
              onChange={(event) => setLibraryQuery(event.target.value)}
              placeholder="Search by filename…"
              className="h-9"
              aria-label="Filter assets"
            />
            {assets.length === 0 ? (
              <p className="text-xs leading-snug text-muted-foreground" role="status">
                No assets found.
              </p>
            ) : libraryQuery.trim() && filteredLibrary.length === 0 ? (
              <p className="text-xs leading-snug text-muted-foreground" role="status">
                No results for{' '}
                <span className="font-medium text-foreground/90">{`\u201c${libraryQuery.trim()}\u201d`}</span>. Adjust your search
                or add a file with the + tile.
              </p>
            ) : null}
          </div>
          <div className="min-h-0 max-h-[min(55vh,28rem)] flex-1 overflow-y-auto overscroll-contain rounded-xl border border-border/50 bg-muted/10 p-2">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <input
                ref={libraryFileInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                aria-label="Upload new image to library"
                disabled={libraryUploading}
                onChange={async (event: ChangeEvent<HTMLInputElement>) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  await handleLibraryNewFile(file);
                }}
              />
              <div
                className={cn(
                  'flex flex-col overflow-hidden rounded-xl border border-dashed bg-card/50 text-left transition-colors',
                  libraryDropActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/35',
                  libraryUploading && 'pointer-events-none opacity-70',
                )}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setLibraryDropActive(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setLibraryDropActive(false);
                }}
                onDrop={async (event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setLibraryDropActive(false);
                  const file = event.dataTransfer.files?.[0];
                  await handleLibraryNewFile(file);
                }}
              >
                <button
                  type="button"
                  disabled={libraryUploading}
                  onClick={() => libraryFileInputRef.current?.click()}
                  className={cn(
                    'flex w-full flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover',
                    'hover:border-primary/45',
                  )}
                >
                  <div className="relative flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 bg-muted/30">
                    {libraryUploading ? (
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
                    <span className="truncate text-[10px] text-muted-foreground">Upload</span>
                  </div>
                </button>
              </div>
              {filteredLibrary.map((asset) => {
                const { primary, hint, title } = assetGalleryLabels(asset);
                const highlighted = asset.id === libraryPickId;
                return (
                  <button
                    key={asset.id}
                    type="button"
                    title={title}
                    aria-pressed={highlighted}
                    onClick={() => setLibraryPickId(asset.id)}
                    className={cn(
                      'flex flex-col overflow-hidden rounded-xl border bg-card text-left transition-colors',
                      'hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover',
                      highlighted ? 'border-primary' : 'border-border/80',
                    )}
                  >
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
                      <img
                        src={asset.variants.thumbnail}
                        alt={asset.alt || primary}
                        className="size-full object-cover"
                        style={{ objectPosition: focalToObjectPosition(asset.focalPoint) }}
                        loading="lazy"
                      />
                      {highlighted ? (
                        <span
                          className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground"
                          aria-hidden
                        >
                          <Check className="size-3.5 stroke-[2.5]" />
                        </span>
                      ) : null}
                    </div>
                    <div className="flex min-h-[2.75rem] flex-col justify-center gap-0.5 border-t border-border/60 px-2.5 py-2">
                      <span className="line-clamp-2 text-xs font-medium leading-snug text-foreground">{primary}</span>
                      {hint ? (
                        <span className="truncate font-mono text-[10px] text-muted-foreground" title={asset.filename}>
                          {hint}
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <DialogFooter className="!-mx-4 !-mb-4 !mt-0 !rounded-b-xl !px-4 !py-3 sm:justify-end sm:gap-2">
            <Button type="button" variant="outline" onClick={() => setBrowserOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!libraryPickId}
              onClick={() => {
                if (!libraryPickId) return;
                onImageChange({ assetId: libraryPickId });
                setBrowserOpen(false);
              }}
            >
              Select
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FieldList({
  token,
  siteId,
  assets,
  contentTypeFieldMap,
  internalUrlSuggestionGroups,
  onAssetsChanged,
  fields,
  value,
  onChange,
}: FieldListProps) {
  function cloneEntryValue<T>(input: T): T {
    return JSON.parse(JSON.stringify(input)) as T;
  }

  const [uploadError, setUploadError] = useState('');

  async function uploadFieldAsset(file: File): Promise<Asset> {
    setUploadError('');
    try {
      const fileBase64 = await fileToBase64(file);
      const response = await gqlRequest<{ uploadAsset: Asset }>(
        token,
        'mutation($siteId:ID!,$fileBase64:String!,$filename:String!,$mimeType:String!){ uploadAsset(siteId:$siteId,fileBase64:$fileBase64,filename:$filename,mimeType:$mimeType){ id siteId uploadedBy filename mimeType sizeBytes width height alt title focalPoint { x y } variants { original web thumbnail small medium large xlarge } createdAt updatedAt } }',
        { siteId, fileBase64, filename: file.name, mimeType: file.type },
      );
      await onAssetsChanged();
      return response.uploadAsset;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to upload asset';
      setUploadError(message);
      throw error;
    }
  }

  return (
    <FieldGroup>
      {uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}
      {fields.map((field) => {
        if (!shouldShowField(field, value)) return null;

        const fieldValue = value[field.key];
        const fieldId = `field-${field.key}`;

        if (field.type === 'repeater') {
          const items = Array.isArray(fieldValue) ? (fieldValue as Record<string, unknown>[]) : [];
          const nestedFields = field.config?.contentTypeId
            ? (contentTypeFieldMap.get(field.config.contentTypeId) ?? [])
            : (field.config?.fields ?? []);

          return (
            <Item key={field.key} variant="muted" className="w-full">
              <ItemContent className="flex w-full flex-col gap-3">
                <Field>
                  <FieldLabel>{field.label}</FieldLabel>
                </Field>

                {items.length ? (
                  <div className="space-y-3">
                    {items.map((item, itemIndex) => (
                      <Collapsible key={`${field.key}-${itemIndex}`} defaultOpen className="group/row w-full">
                        <Card className="gap-0 overflow-hidden border-border bg-background p-0 shadow-sm">
                          <CardHeader className="relative mb-0 space-y-0 border-b border-border px-4 py-3 sm:px-5">
                            <CollapsibleTrigger asChild>
                              <button
                                type="button"
                                className="absolute inset-0 z-0 rounded-t-xl hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                                aria-label={`Toggle row ${(itemIndex + 1).toString()}`}
                              />
                            </CollapsibleTrigger>
                            <div className="relative z-10 flex items-center justify-between gap-3 pointer-events-none">
                              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                                <CardTitle className="shrink-0 text-sm font-semibold leading-snug tracking-tight">
                                  Row {(itemIndex + 1).toString()}
                                </CardTitle>
                                {(() => {
                                  const firstNestedField = nestedFields[0];
                                  const summary = firstNestedField ? formatRowSummaryValue(item[firstNestedField.key]) : '';
                                  if (!summary) return null;
                                  return (
                                    <Badge
                                      variant="secondary"
                                      className="max-w-[min(20rem,100%)] shrink truncate group-data-[state=open]/row:hidden"
                                      title={summary}
                                    >
                                      {summary}
                                    </Badge>
                                  );
                                })()}
                              </div>
                              <CardAction className="gap-1">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button type="button" variant="outline" size="icon-sm" aria-label="Row options">
                                      <Ellipsis />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuGroup>
                                      <DropdownMenuItem
                                        onClick={() => {
                                          const next = [...items];
                                          next.splice(itemIndex + 1, 0, cloneEntryValue(item));
                                          onChange({ ...value, [field.key]: next });
                                        }}
                                      >
                                        <Copy />
                                        Duplicate row
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() => {
                                          const next = [...items];
                                          next.splice(itemIndex, 1);
                                          onChange({ ...value, [field.key]: next });
                                        }}
                                      >
                                        <Trash2 />
                                        Delete row
                                      </DropdownMenuItem>
                                    </DropdownMenuGroup>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                                <CollapsibleTrigger asChild>
                                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Toggle row">
                                    <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]/row:rotate-180" />
                                  </Button>
                                </CollapsibleTrigger>
                              </CardAction>
                            </div>
                          </CardHeader>
                          <CollapsibleContent className="px-4 pb-4 pt-4 sm:px-5">
                            <FieldList
                              token={token}
                              siteId={siteId}
                              assets={assets}
                              contentTypeFieldMap={contentTypeFieldMap}
                              internalUrlSuggestionGroups={internalUrlSuggestionGroups}
                              onAssetsChanged={onAssetsChanged}
                              fields={nestedFields}
                              value={item}
                              onChange={(nextItem) => {
                                const next = [...items];
                                next[itemIndex] = nextItem;
                                onChange({ ...value, [field.key]: next });
                              }}
                            />
                          </CollapsibleContent>
                        </Card>
                      </Collapsible>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Empty list.</p>
                )}

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="self-start text-primary"
                  onClick={() => onChange({ ...value, [field.key]: [...items, {}] })}
                >
                  <Plus className="h-4 w-4" />
                  Add row
                </Button>
              </ItemContent>
            </Item>
          );
        }

        return (
          <Field key={field.key}>
            <FieldLabel htmlFor={field.type === 'boolean' ? undefined : fieldId}>{field.label}</FieldLabel>
            <FieldContent>

              {field.type === 'textarea' || field.type === 'wysiwyg' ? (
                <MarkdownEditor
                  markdown={String(fieldValue ?? '')}
                  onChange={(nextMarkdown) => onChange({ ...value, [field.key]: nextMarkdown })}
                  placeholder="Content (Markdown)"
                />
              ) : field.type === 'boolean' ? (
                <div className="flex items-center gap-2">
                  <Checkbox checked={Boolean(fieldValue)} onCheckedChange={(next) => onChange({ ...value, [field.key]: Boolean(next) })} id={fieldId} />
                  <Label htmlFor={fieldId}>Enabled</Label>
                </div>
              ) : field.type === 'select' ? (
                <Combobox
                  value={String(fieldValue ?? '')}
                  onValueChange={(next) => onChange({ ...value, [field.key]: next })}
                  options={(field.config?.options ?? []).map((option) => ({ value: option, label: option }))}
                  placeholder="Select option"
                  searchPlaceholder="Search option..."
                  className="w-full"
                />
              ) : field.type === 'image' ? (
                <ImageFieldInput
                  fieldId={fieldId}
                  value={(fieldValue ?? {}) as Partial<ImageFieldValue>}
                  assets={assets}
                  onImageChange={(next) =>
                    onChange({
                      ...value,
                      [field.key]: { assetId: next.assetId ?? '' },
                    })
                  }
                  uploadAsset={uploadFieldAsset}
                />
              ) : field.type === 'url' ? (
                <Combobox
                  id={fieldId}
                  value={String(fieldValue ?? '')}
                  onValueChange={(next) => onChange({ ...value, [field.key]: next })}
                  options={[]}
                  groups={internalUrlSuggestionGroups}
                  placeholder="https://example.com/page or /about"
                  searchPlaceholder="Search URLs..."
                  className="w-full"
                />
              ) : (
                <Input
                  id={fieldId}
                  type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                  inputMode={field.type === 'number' ? 'decimal' : undefined}
                  value={String(fieldValue ?? '')}
                  onChange={(event) => {
                    const nextValue = field.type === 'number' ? (event.target.value === '' ? '' : Number(event.target.value)) : event.target.value;
                    onChange({ ...value, [field.key]: nextValue });
                  }}
                />
              )}
            </FieldContent>
          </Field>
        );
      })}
    </FieldGroup>
  );
}

export function EntriesPage({ token, workspaceSiteId, sites, forcedContentTypeSlug, entryId }: EntriesPageProps) {
  const navigate = useNavigate();
  const activeSite = sites.find((site) => site.id === workspaceSiteId);

  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [entriesByTypeId, setEntriesByTypeId] = useState<Record<string, Entry[]>>({});
  const [assets, setAssets] = useState<Asset[]>([]);

  const [isLoadingTypes, setIsLoadingTypes] = useState(false);
  const [isLoadingEntries, setIsLoadingEntries] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [entryName, setEntryName] = useState('');
  const [slug, setSlug] = useState('');
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
  const [data, setData] = useState<Record<string, unknown>>({});

  const selectedType = useMemo(() => contentTypes.find((contentType) => contentType.id === selectedTypeId) ?? null, [contentTypes, selectedTypeId]);
  const requiresSlug = Boolean(selectedType?.options?.hasSlug);
  const contentTypeFieldMap = useMemo(
    () => new Map(contentTypes.map((contentType) => [contentType.id, contentType.fields ?? []] as const)),
    [contentTypes],
  );
  const internalUrlSuggestionGroups = useMemo(() => {
    const groups: Array<{ label: string; options: Array<{ value: string; label: string }> }> = [
      {
        label: 'General',
        options: [{ value: '/', label: '/' }],
      },
    ];

    for (const contentType of contentTypes) {
      // Only suggest routes visitors can open: types with entry slugs at site root (e.g. pages).
      // Skip collection slugs like /blocks and non-page types without hasSlug.
      if (!contentType.options?.hasSlug) continue;

      const entriesForType = entriesByTypeId[contentType.id] ?? [];
      const urls = new Set<string>();
      for (const entry of entriesForType) {
        if (!entry.slug) continue;
        urls.add(`/${entry.slug}`);
      }
      const options = [...urls].sort((a, b) => a.localeCompare(b)).map((url) => ({ value: url, label: url }));
      if (options.length) {
        groups.push({ label: contentType.name, options });
      }
    }

    return groups;
  }, [contentTypes, entriesByTypeId]);

  const basePath = forcedContentTypeSlug ? `/content/${forcedContentTypeSlug}` : '/entries';
  const isDetailView = Boolean(entryId);
  const showTypeSelector = !forcedContentTypeSlug;

  async function loadAssets() {
    if (!workspaceSiteId) return;
    const response = await gqlRequest<{ listAssets: Asset[] }>(
      token,
      'query($siteId:ID!){ listAssets(siteId:$siteId,limit:200){ id siteId uploadedBy filename mimeType sizeBytes width height alt title focalPoint { x y } variants { original web thumbnail small medium large xlarge } createdAt updatedAt } }',
      { siteId: workspaceSiteId },
    );
    setAssets(response.listAssets);
  }

  async function loadContentTypes() {
    if (!workspaceSiteId) return;
    setIsLoadingTypes(true);
    setError('');
    try {
      const response = await gqlRequest<{ contentTypes: ContentType[] }>(
        token,
        'query($siteId:ID!){ contentTypes(siteId:$siteId){ id siteId name slug fields options } }',
        { siteId: workspaceSiteId },
      );
      setContentTypes(response.contentTypes);
      await loadEntriesIndex(response.contentTypes);
      setSelectedTypeId((current) => {
        if (forcedContentTypeSlug) {
          const forced = response.contentTypes.find((item) => item.slug === forcedContentTypeSlug);
          if (forced) return forced.id;
        }
        if (current && response.contentTypes.some((item) => item.id === current)) return current;
        return response.contentTypes[0]?.id ?? '';
      });
      await loadAssets();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load content types');
    } finally {
      setIsLoadingTypes(false);
    }
  }

  async function loadEntries(contentTypeId: string) {
    if (!workspaceSiteId || !contentTypeId) {
      setEntries([]);
      return;
    }
    setIsLoadingEntries(true);
    setError('');
    try {
      const response = await gqlRequest<{ entries: Entry[] }>(
        token,
        'query($siteId:ID!,$contentTypeId:ID!){ entries(siteId:$siteId,contentTypeId:$contentTypeId){ id siteId contentTypeId name slug data updatedAt lastEditedBy { id email } } }',
        { siteId: workspaceSiteId, contentTypeId },
      );
      setEntries(response.entries);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load entries');
    } finally {
      setIsLoadingEntries(false);
    }
  }

  async function loadEntriesIndex(types: ContentType[]) {
    if (!workspaceSiteId || !types.length) {
      setEntriesByTypeId({});
      return;
    }

    const pairs = await Promise.all(
      types.map(async (contentType) => {
        try {
          const response = await gqlRequest<{ entries: Entry[] }>(
            token,
            'query($siteId:ID!,$contentTypeId:ID!){ entries(siteId:$siteId,contentTypeId:$contentTypeId){ id siteId contentTypeId name slug data updatedAt lastEditedBy { id email } } }',
            { siteId: workspaceSiteId, contentTypeId: contentType.id },
          );
          return [contentType.id, response.entries] as const;
        } catch {
          return [contentType.id, []] as const;
        }
      }),
    );

    setEntriesByTypeId(Object.fromEntries(pairs));
  }

  useEffect(() => {
    void loadContentTypes();
  }, [workspaceSiteId, forcedContentTypeSlug]);

  useEffect(() => {
    void loadEntries(selectedTypeId);
  }, [selectedTypeId]);

  useEffect(() => {
    if (!entryId) {
      setEntryName('');
      setSlug('');
      setIsSlugManuallyEdited(false);
      setData({});
      return;
    }
    if (entryId === 'new') {
      setEntryName('');
      setSlug('');
      setIsSlugManuallyEdited(false);
      setData({});
      return;
    }
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) return;
    setEntryName(entry.name ?? '');
    setSlug(entry.slug ?? '');
    setIsSlugManuallyEdited(false);
    setData((entry.data ?? {}) as Record<string, unknown>);
  }, [entryId, entries]);

  useEffect(() => {
    if (!requiresSlug || entryId !== 'new' || isSlugManuallyEdited) return;
    setSlug(
      entryName
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, ''),
    );
  }, [requiresSlug, entryId, entryName, isSlugManuallyEdited]);

  async function handleSaveEntry() {
    if (!workspaceSiteId || !selectedTypeId) return;
    setIsSaving(true);
    setError('');
    try {
      if (entryId && entryId !== 'new') {
        const response = await gqlRequest<{ updateEntry: { id: string } }>(
          token,
          'mutation($id:ID!,$siteId:ID!,$name:String!,$slug:String,$data:JSON){ updateEntry(id:$id,siteId:$siteId,name:$name,slug:$slug,data:$data){ id } }',
          {
            id: entryId,
            siteId: workspaceSiteId,
            name: entryName.trim(),
            slug: requiresSlug ? slug : null,
            data,
          },
        );
        navigate(`${basePath}/${response.updateEntry.id}`, { replace: true });
      } else {
        const response = await gqlRequest<{ createEntry: { id: string } }>(
          token,
          'mutation($siteId:ID!,$contentTypeId:ID!,$name:String!,$slug:String,$data:JSON!){ createEntry(siteId:$siteId,contentTypeId:$contentTypeId,name:$name,slug:$slug,data:$data){ id } }',
          {
            siteId: workspaceSiteId,
            contentTypeId: selectedTypeId,
            name: entryName.trim(),
            slug: requiresSlug ? slug : null,
            data,
          },
        );
        navigate(`${basePath}/${response.createEntry.id}`, { replace: true });
      }
      await loadEntries(selectedTypeId);
      await loadEntriesIndex(contentTypes);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save entry');
    } finally {
      setIsSaving(false);
    }
  }

  const handleDeleteEntry = useCallback(
    async (id: string) => {
      if (!workspaceSiteId) return;
      setError('');
      try {
        await gqlRequest(token, 'mutation($id:ID!,$siteId:ID!){ deleteEntry(id:$id,siteId:$siteId) }', {
          id,
          siteId: workspaceSiteId,
        });
        await loadEntries(selectedTypeId);
        await loadEntriesIndex(contentTypes);
        navigate(basePath);
      } catch (deleteError) {
        setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete entry');
      }
    },
    [workspaceSiteId, selectedTypeId, contentTypes, token, navigate, basePath],
  );

  const handleDuplicateEntry = useCallback(
    async (entry: Entry) => {
      if (!workspaceSiteId || !selectedTypeId) return;
      setError('');
      try {
        const data = structuredClone((entry.data ?? {}) as Record<string, unknown>);

        const hasSlug = Boolean(selectedType?.options?.hasSlug);
        let slug: string | null = null;
        if (hasSlug) {
          const base = entry.slug?.trim() ?? '';
          if (base) {
            const taken = new Set(entries.map((e) => e.slug).filter((s): s is string => Boolean(s)));
            let candidate = `${base}-copy`;
            let n = 2;
            while (taken.has(candidate)) {
              candidate = `${base}-copy-${n}`;
              n += 1;
            }
            slug = candidate;
          }
        }

        const baseName = (entry.name ?? '').trim() || 'Entry';
        const takenNames = new Set(entries.map((e) => e.name).filter(Boolean));
        let duplicateName = `${baseName} (copy)`;
        let nameN = 2;
        while (takenNames.has(duplicateName)) {
          duplicateName = `${baseName} (copy) ${nameN}`;
          nameN += 1;
        }

        await gqlRequest<{ createEntry: { id: string } }>(
          token,
          'mutation($siteId:ID!,$contentTypeId:ID!,$name:String!,$slug:String,$data:JSON!){ createEntry(siteId:$siteId,contentTypeId:$contentTypeId,name:$name,slug:$slug,data:$data){ id } }',
          { siteId: workspaceSiteId, contentTypeId: entry.contentTypeId, name: duplicateName, slug, data },
        );
        await loadEntries(selectedTypeId);
        await loadEntriesIndex(contentTypes);
      } catch (dupError) {
        setError(dupError instanceof Error ? dupError.message : 'Failed to duplicate entry');
      }
    },
    [workspaceSiteId, selectedTypeId, selectedType, entries, contentTypes, token],
  );

  const columns = useMemo<ColumnDef<Entry>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => <span className="font-medium">{row.original.name || '—'}</span>,
      },
      { accessorKey: 'slug', header: 'Slug', cell: ({ row }) => row.original.slug ?? '—' },
      {
        id: 'updatedAt',
        header: 'Last updated',
        cell: ({ row }) => new Date(row.original.updatedAt).toLocaleString(),
      },
      {
        id: 'lastEditedBy',
        header: 'Last edited by',
        cell: ({ row }) => {
          const email = row.original.lastEditedBy?.email;
          if (!email) {
            return (
              <Avatar className="size-8">
                <AvatarFallback className="text-xs">?</AvatarFallback>
              </Avatar>
            );
          }
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label={`Last edited by ${email}`}
                >
                  <Avatar className="size-8">
                    <AvatarFallback className="text-xs font-medium">{initialsFromEmail(email)}</AvatarFallback>
                  </Avatar>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{email}</TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        id: 'actions',
        meta: { compact: true },
        header: '',
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Entry actions">
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => void handleDuplicateEntry(row.original)}>
                  <Copy />
                  Duplicate entry
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => {
                    if (window.confirm('Delete this entry? This cannot be undone.')) {
                      void handleDeleteEntry(row.original.id);
                    }
                  }}
                >
                  <Trash2 />
                  Delete entry
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [entries, handleDeleteEntry, handleDuplicateEntry],
  );

  const editingEntry = entryId && entryId !== 'new' ? entries.find((item) => item.id === entryId) ?? null : null;

  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);

  const currentSnapshot = useMemo(
    () =>
      stableJsonStringify({
        entryName: entryName.trim(),
        slug,
        data,
      }),
    [entryName, slug, data],
  );

  useLayoutEffect(() => {
    if (!isDetailView || !entryId) {
      setSavedSnapshot(null);
      return;
    }
    if (entryId === 'new') {
      setSavedSnapshot(stableJsonStringify({ entryName: '', slug: '', data: {} }));
      return;
    }
    if (!editingEntry) {
      setSavedSnapshot(null);
      return;
    }
    setSavedSnapshot(
      stableJsonStringify({
        entryName: (editingEntry.name ?? '').trim(),
        slug: editingEntry.slug ?? '',
        data: (editingEntry.data ?? {}) as Record<string, unknown>,
      }),
    );
  }, [isDetailView, entryId, editingEntry]);

  const isDirty = Boolean(
    isDetailView && savedSnapshot !== null && currentSnapshot !== savedSnapshot,
  );
  const unsavedPrompt = useUnsavedChangesPrompt({ isDirty });

  if (isDetailView) {
    return (
      <>
        {unsavedPrompt}
        <div className="w-full space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>{entryId === 'new' ? 'Create Entry' : 'Edit Entry'}</CardTitle>
            <Button variant="outline" onClick={() => navigate(basePath)}>
              Back to table
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {error ? <p className="text-sm text-destructive" aria-live="polite">{error}</p> : null}
            {selectedType ? (
              <>
                <Field>
                  <FieldLabel htmlFor="entry-display-name">Display name</FieldLabel>
                  <FieldContent>
                    <Input
                      id="entry-display-name"
                      value={entryName}
                      onChange={(event) => setEntryName(event.target.value)}
                      placeholder="Visible title in the admin and lists"
                      autoComplete="off"
                    />
                  </FieldContent>
                </Field>
                {requiresSlug ? (
                  <Field>
                    <FieldLabel htmlFor="entry-slug">Slug</FieldLabel>
                    <FieldContent>
                      <InputGroup>
                        <InputGroupAddon>
                          <InputGroupText>
                            <Globe />
                            {`https://${activeSite?.url ?? 'site'}/`}
                          </InputGroupText>
                        </InputGroupAddon>
                        <InputGroupInput
                          id="entry-slug"
                          className="-translate-y-px"
                          value={slug}
                          onChange={(event) => {
                            setIsSlugManuallyEdited(true);
                            setSlug(event.target.value);
                          }}
                          placeholder="homepage-hero"
                        />
                      </InputGroup>
                    </FieldContent>
                  </Field>
                ) : null}
                <FieldList
                  token={token}
                  siteId={workspaceSiteId}
                  assets={assets}
                  contentTypeFieldMap={contentTypeFieldMap}
                  internalUrlSuggestionGroups={internalUrlSuggestionGroups}
                  onAssetsChanged={loadAssets}
                  fields={selectedType.fields ?? []}
                  value={data}
                  onChange={setData}
                />
                <div className="flex gap-2">
                  {editingEntry ? (
                    <Button variant="outline" onClick={() => void handleDeleteEntry(editingEntry.id)}>
                      Delete
                    </Button>
                  ) : (
                    <Button variant="outline" onClick={() => navigate(basePath)}>
                      Cancel
                    </Button>
                  )}
                  <Button
                    onClick={() => void handleSaveEntry()}
                    disabled={isSaving || !entryName.trim() || (requiresSlug && !slug.trim())}
                  >
                    {isSaving ? 'Saving…' : entryId === 'new' ? 'Create Entry' : 'Update Entry'}
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Select a content type to manage entries.</p>
            )}
          </CardContent>
        </Card>
      </div>
      </>
    );
  }

  return (
    <>
      {unsavedPrompt}
      <div className="w-full space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>{selectedType?.name ?? 'Content Entries'}</CardTitle>
          <div className="flex items-center gap-2">
            {showTypeSelector ? (
              <Combobox
                value={selectedTypeId}
                onValueChange={setSelectedTypeId}
                options={contentTypes.map((contentType) => ({ value: contentType.id, label: contentType.name }))}
                placeholder={isLoadingTypes ? 'Loading…' : 'Select content type'}
                className="w-52"
              />
            ) : null}
            <Button onClick={() => navigate(`${basePath}/new`)} disabled={!selectedTypeId}>
              New Entry
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <p className="text-sm text-destructive" aria-live="polite">{error}</p> : null}
          {selectedType ? (
            <DataTable
              columns={columns}
              data={entries}
              isLoading={isLoadingEntries}
              emptyMessage="No entries yet."
              showColumnToggle={false}
              onRowClick={(entry) => navigate(`${basePath}/${entry.id}`)}
              rowClickIgnoreColumnIds={['actions', 'lastEditedBy']}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Select a content type to manage entries.</p>
          )}
        </CardContent>
      </Card>
    </div>
    </>
  );
}
