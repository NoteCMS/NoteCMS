import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ChevronDown, Copy, Ellipsis, Globe, Plus, Trash2 } from 'lucide-react';
import { gqlRequest } from '@/api/graphql';
import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Combobox } from '@/components/ui/combobox';
import { Field, FieldContent, FieldGroup, FieldLabel } from '@/components/ui/field';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
import { Item, ItemActions, ItemContent } from '@/components/ui/item';
import { Label } from '@/components/ui/label';
import { MarkdownEditor } from '@/components/ui/markdown-editor';
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

  async function uploadFieldAsset(file: File, onDone: (asset: Asset) => void) {
    setUploadError('');
    try {
      const fileBase64 = await fileToBase64(file);
      const response = await gqlRequest<{ uploadAsset: Asset }>(
        token,
        'mutation($siteId:ID!,$fileBase64:String!,$filename:String!,$mimeType:String!){ uploadAsset(siteId:$siteId,fileBase64:$fileBase64,filename:$filename,mimeType:$mimeType){ id siteId uploadedBy filename mimeType sizeBytes width height alt title variants { original web thumbnail } createdAt updatedAt } }',
        { siteId, fileBase64, filename: file.name, mimeType: file.type },
      );
      await onAssetsChanged();
      onDone(response.uploadAsset);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Failed to upload asset');
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
              <ItemContent className="w-full">
                <Field>
                  <div className="flex items-center justify-between gap-2">
                    <FieldLabel>{field.label}</FieldLabel>
                    <ItemActions>
                      <Button type="button" variant="outline" size="sm" onClick={() => onChange({ ...value, [field.key]: [...items, {}] })}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add row
                      </Button>
                    </ItemActions>
                  </div>
                </Field>

                {items.length ? (
                  <div className="space-y-3">
                    {items.map((item, itemIndex) => (
                      <Collapsible key={`${field.key}-${itemIndex}`} defaultOpen className="group/row w-full">
                        <Item variant="outline" className="w-full bg-background">
                          <ItemContent className="w-full">
                            <div className="flex items-center justify-between">
                              <div className="flex min-w-0 items-center gap-2">
                                <p className="text-xs text-muted-foreground">Row {(itemIndex + 1).toString()}</p>
                                {(() => {
                                  const firstNestedField = nestedFields[0];
                                  const summary = firstNestedField ? formatRowSummaryValue(item[firstNestedField.key]) : '';
                                  if (!summary) return null;
                                  return (
                                    <Badge
                                      variant="secondary"
                                      className="max-w-[14rem] truncate group-data-[state=open]/row:hidden"
                                      title={summary}
                                    >
                                      {summary}
                                    </Badge>
                                  );
                                })()}
                              </div>
                              <div className="flex items-center gap-1">
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
                              </div>
                            </div>
                            <CollapsibleContent className="pt-2">
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
                          </ItemContent>
                        </Item>
                      </Collapsible>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No rows yet.</p>
                )}
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
                  placeholder="Write markdown content…"
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
                <div className="space-y-2">
                  {(() => {
                    const imageValue = (fieldValue ?? {}) as Partial<ImageFieldValue>;
                    const selectedAsset = assets.find((asset) => asset.id === imageValue.assetId);
                    const preview = selectedAsset?.variants.thumbnail;

                    return (
                      <>
                        <Combobox
                          value={imageValue.assetId ?? ''}
                          onValueChange={(next) => onChange({ ...value, [field.key]: { assetId: next, variant: imageValue.variant ?? 'web' } })}
                          options={assets.map((asset) => ({ value: asset.id, label: asset.filename }))}
                          placeholder="Select image asset"
                          searchPlaceholder="Search assets..."
                          className="w-full"
                        />
                        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                          <Combobox
                            value={imageValue.variant ?? 'web'}
                            onValueChange={(next) => onChange({ ...value, [field.key]: { assetId: imageValue.assetId ?? '', variant: next } })}
                            options={[
                              { value: 'original', label: 'original' },
                              { value: 'web', label: 'web' },
                              { value: 'thumbnail', label: 'thumbnail' },
                            ]}
                            placeholder="Variant"
                            className="w-full"
                          />
                          <Input
                            id={fieldId}
                            type="file"
                            accept="image/*"
                            onChange={async (event: ChangeEvent<HTMLInputElement>) => {
                              const file = event.target.files?.[0];
                              event.target.value = '';
                              if (!file) return;
                              await uploadFieldAsset(file, (asset) => {
                                onChange({
                                  ...value,
                                  [field.key]: { assetId: asset.id, variant: imageValue.variant ?? 'web' },
                                });
                              });
                            }}
                          />
                        </div>
                        {preview ? (
                          <img src={preview} alt={selectedAsset?.alt || selectedAsset?.filename || 'Asset preview'} className="h-28 w-40 rounded-md border object-cover" loading="lazy" />
                        ) : (
                          <p className="text-xs text-muted-foreground">No image selected.</p>
                        )}
                      </>
                    );
                  })()}
                </div>
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
  const [slug, setSlug] = useState('');
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
  const [data, setData] = useState<Record<string, unknown>>({});

  const selectedType = useMemo(() => contentTypes.find((contentType) => contentType.id === selectedTypeId) ?? null, [contentTypes, selectedTypeId]);
  const requiresSlug = Boolean(selectedType?.options?.hasSlug);
  const slugFieldKey = selectedType?.options?.slugFieldKey ?? '';
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
      'query($siteId:ID!){ listAssets(siteId:$siteId,limit:200){ id siteId uploadedBy filename mimeType sizeBytes width height alt title variants { original web thumbnail } createdAt updatedAt } }',
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
        'query($siteId:ID!,$contentTypeId:ID!){ entries(siteId:$siteId,contentTypeId:$contentTypeId){ id siteId contentTypeId slug data updatedAt lastEditedBy { id email } } }',
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
            'query($siteId:ID!,$contentTypeId:ID!){ entries(siteId:$siteId,contentTypeId:$contentTypeId){ id siteId contentTypeId slug data updatedAt lastEditedBy { id email } } }',
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
      setSlug('');
      setIsSlugManuallyEdited(false);
      setData({});
      return;
    }
    if (entryId === 'new') {
      setSlug('');
      setIsSlugManuallyEdited(false);
      setData({});
      return;
    }
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) return;
    setSlug(entry.slug ?? '');
    setIsSlugManuallyEdited(false);
    setData((entry.data ?? {}) as Record<string, unknown>);
  }, [entryId, entries]);

  useEffect(() => {
    if (!requiresSlug || !slugFieldKey || entryId !== 'new' || isSlugManuallyEdited) return;
    const sourceValue = data[slugFieldKey];
    if (typeof sourceValue !== 'string') return;
    setSlug(
      sourceValue
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, ''),
    );
  }, [requiresSlug, slugFieldKey, data, entryId, isSlugManuallyEdited]);

  async function handleSaveEntry() {
    if (!workspaceSiteId || !selectedTypeId) return;
    setIsSaving(true);
    setError('');
    try {
      if (entryId && entryId !== 'new') {
        const response = await gqlRequest<{ updateEntry: { id: string } }>(
          token,
          'mutation($id:ID!,$siteId:ID!,$slug:String,$data:JSON){ updateEntry(id:$id,siteId:$siteId,slug:$slug,data:$data){ id } }',
          { id: entryId, siteId: workspaceSiteId, slug: requiresSlug ? slug : null, data },
        );
        navigate(`${basePath}/${response.updateEntry.id}`, { replace: true });
      } else {
        const response = await gqlRequest<{ createEntry: { id: string } }>(
          token,
          'mutation($siteId:ID!,$contentTypeId:ID!,$slug:String,$data:JSON!){ createEntry(siteId:$siteId,contentTypeId:$contentTypeId,slug:$slug,data:$data){ id } }',
          { siteId: workspaceSiteId, contentTypeId: selectedTypeId, slug: requiresSlug ? slug : null, data },
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

  async function handleDeleteEntry(entryId: string) {
    if (!workspaceSiteId) return;
    setError('');
    try {
      await gqlRequest(token, 'mutation($id:ID!,$siteId:ID!){ deleteEntry(id:$id,siteId:$siteId) }', {
        id: entryId,
        siteId: workspaceSiteId,
      });
      await loadEntries(selectedTypeId);
      await loadEntriesIndex(contentTypes);
      navigate(basePath);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete entry');
    }
  }

  const columns = useMemo<ColumnDef<Entry>[]>(
    () => [
      { accessorKey: 'slug', header: 'Slug', cell: ({ row }) => row.original.slug ?? '—' },
      {
        id: 'updatedAt',
        header: 'Last updated',
        cell: ({ row }) => new Date(row.original.updatedAt).toLocaleString(),
      },
      {
        id: 'lastEditedBy',
        header: 'Last edited by',
        cell: ({ row }) => row.original.lastEditedBy?.email ?? 'Unknown',
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Button variant="outline" size="sm" onClick={() => navigate(`${basePath}/${row.original.id}`)}>
            Edit
          </Button>
        ),
      },
    ],
    [navigate, basePath],
  );

  const editingEntry = entryId && entryId !== 'new' ? entries.find((item) => item.id === entryId) ?? null : null;

  if (isDetailView) {
    return (
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
                  <Button onClick={() => void handleSaveEntry()} disabled={isSaving || (requiresSlug && !slug.trim())}>
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
    );
  }

  return (
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
            <DataTable columns={columns} data={entries} isLoading={isLoadingEntries} emptyMessage="No entries yet." showColumnToggle={false} />
          ) : (
            <p className="text-sm text-muted-foreground">Select a content type to manage entries.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
