import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { TagInput, type Tag } from 'emblor-maintained';
import { ChevronDown, Copy, Ellipsis, GripVertical, Plus, Trash2 } from 'lucide-react';
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useNavigate } from 'react-router-dom';
import { gqlRequest } from '@/api/graphql';
import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import type {
  ConditionOperator,
  ContentField,
  ContentType,
  FieldType,
  Site,
  VisibilityConfig,
  VisibilityGroup,
  VisibilityRule,
} from '@/types/app';

type ContentTypesPageProps = {
  token: string;
  workspaceSiteId: string;
  sites: Site[];
};

type ContentTypeEditorPageProps = {
  token: string;
  workspaceSiteId: string;
  sites: Site[];
  contentTypeId: string | null;
};

const fieldTypeOptions: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'text' },
  { value: 'textarea', label: 'textarea' },
  { value: 'number', label: 'number' },
  { value: 'boolean', label: 'boolean' },
  { value: 'date', label: 'date' },
  { value: 'select', label: 'select' },
  { value: 'image', label: 'image' },
  { value: 'repeater', label: 'repeater' },
];

const relationOptions = [
  { value: 'all', label: 'All rules (AND)' },
  { value: 'any', label: 'Any rule (OR)' },
] as const;

const operatorOptions: { value: ConditionOperator; label: string }[] = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Does not equal' },
  { value: 'contains', label: 'Contains' },
  { value: 'not_contains', label: 'Does not contain' },
  { value: 'is_empty', label: 'Is empty' },
  { value: 'is_not_empty', label: 'Is not empty' },
  { value: 'gt', label: 'Greater than' },
  { value: 'lt', label: 'Less than' },
];

function makeId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createEmptyField(): ContentField {
  return { key: '', label: '', type: 'text', required: false, config: {} };
}

function createDefaultRule(): VisibilityRule {
  return { id: makeId(), fieldKey: '', operator: 'equals', value: '' };
}

function createDefaultGroup(): VisibilityGroup {
  return { id: makeId(), relation: 'all', rules: [createDefaultRule()] };
}

function cloneField(field: ContentField): ContentField {
  return {
    ...field,
    config: {
      options: field.config?.options ? [...field.config.options] : undefined,
      fields: field.config?.fields ? field.config.fields.map(cloneField) : undefined,
      visibility: field.config?.visibility
        ? {
            relation: field.config.visibility.relation,
            groups: field.config.visibility.groups.map((group) => ({
              id: group.id,
              relation: group.relation,
              rules: group.rules.map((rule) => ({ ...rule })),
            })),
          }
        : undefined,
    },
  };
}

function updateFieldAtPath(fields: ContentField[], path: number[], updater: (field: ContentField) => ContentField): ContentField[] {
  const [index, ...rest] = path;
  return fields.map((field, fieldIndex) => {
    if (fieldIndex !== index) return field;
    if (!rest.length) return updater(field);
    const nested = field.config?.fields ?? [];
    return {
      ...field,
      config: {
        ...field.config,
        fields: updateFieldAtPath(nested, rest, updater),
      },
    };
  });
}

function removeFieldAtPath(fields: ContentField[], path: number[]): ContentField[] {
  const [index, ...rest] = path;
  if (!rest.length) return fields.filter((_, fieldIndex) => fieldIndex !== index);
  return fields.map((field, fieldIndex) => {
    if (fieldIndex !== index) return field;
    return {
      ...field,
      config: {
        ...field.config,
        fields: removeFieldAtPath(field.config?.fields ?? [], rest),
      },
    };
  });
}

function flattenFieldKeys(
  fields: ContentField[],
  contentTypeFieldMap?: Map<string, ContentField[]>,
  visited = new Set<string>(),
): string[] {
  const keys: string[] = [];
  for (const field of fields) {
    if (field.key) keys.push(field.key);
    if (field.type === 'repeater') {
      const referenceId = field.config?.contentTypeId;
      if (referenceId && contentTypeFieldMap && !visited.has(referenceId)) {
        visited.add(referenceId);
        keys.push(...flattenFieldKeys(contentTypeFieldMap.get(referenceId) ?? [], contentTypeFieldMap, visited));
        visited.delete(referenceId);
      } else {
        keys.push(...flattenFieldKeys(field.config?.fields ?? [], contentTypeFieldMap, visited));
      }
    }
  }
  return keys;
}

function flattenFieldMeta(
  fields: ContentField[],
  map = new Map<string, { type: FieldType; options?: string[] }>(),
  contentTypeFieldMap?: Map<string, ContentField[]>,
  visited = new Set<string>(),
): Map<string, { type: FieldType; options?: string[] }> {
  for (const field of fields) {
    if (field.key) {
      map.set(field.key, {
        type: field.type,
        options: field.type === 'select' ? (field.config?.options ?? []) : undefined,
      });
    }
    if (field.type === 'repeater') {
      const referenceId = field.config?.contentTypeId;
      if (referenceId && contentTypeFieldMap && !visited.has(referenceId)) {
        visited.add(referenceId);
        flattenFieldMeta(contentTypeFieldMap.get(referenceId) ?? [], map, contentTypeFieldMap, visited);
        visited.delete(referenceId);
      } else {
        flattenFieldMeta(field.config?.fields ?? [], map, contentTypeFieldMap, visited);
      }
    }
  }
  return map;
}

type FieldBuilderProps = {
  fields: ContentField[];
  onChange: (next: ContentField[]) => void;
  availableKeys: string[];
  fieldMetaMap: Map<string, { type: FieldType; options?: string[] }>;
  contentTypeOptions: { value: string; label: string }[];
  contentTypeFieldMap: Map<string, ContentField[]>;
  depth?: number;
};

type SortableFieldItemProps = {
  field: ContentField;
  index: number;
  depth: number;
  fields: ContentField[];
  onChange: (next: ContentField[]) => void;
  availableKeys: string[];
  fieldMetaMap: Map<string, { type: FieldType; options?: string[] }>;
  contentTypeOptions: { value: string; label: string }[];
  contentTypeFieldMap: Map<string, ContentField[]>;
};

function SortableFieldItem({
  field,
  index,
  depth,
  fields,
  onChange,
  availableKeys,
  fieldMetaMap,
  contentTypeOptions,
  contentTypeFieldMap,
}: SortableFieldItemProps) {
  const sortableId = `${depth}-${index}`;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sortableId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.8 : 1,
  };

  const fieldTitle = field.label || field.key || `Field ${index + 1}`;
  const tagOptions: Tag[] = (field.config?.options ?? []).map((option, optionIndex) => ({
    id: `${field.key || 'option'}-${optionIndex}`,
    text: option,
  }));
  const [activeTagIndex, setActiveTagIndex] = useState<number | null>(null);
  const repeaterSource = field.config && 'contentTypeId' in field.config ? 'contentType' : 'custom';
  const nestedFields = repeaterSource === 'contentType'
    ? (contentTypeFieldMap.get(field.config?.contentTypeId ?? '') ?? [])
    : (field.config?.fields ?? []);
  const visibility = field.config?.visibility;
  const [open, setOpen] = useState(true);
  const ruleFieldOptions = availableKeys
    .filter((key) => key && key !== field.key)
    .map((key) => ({ value: key, label: key }));

  const setVisibility = (next: VisibilityConfig | undefined) =>
    onChange(
      updateFieldAtPath(fields, [index], (current) => ({
        ...current,
        config: {
          ...(current.config ?? {}),
          visibility: next,
        },
      })),
    );

  function updateGroup(groupId: string, updater: (group: VisibilityGroup) => VisibilityGroup) {
    if (!visibility) return;
    setVisibility({
      ...visibility,
      groups: visibility.groups.map((group) => (group.id === groupId ? updater(group) : group)),
    });
  }

  return (
    <div ref={setNodeRef} style={style} className="space-y-4 rounded-md border p-3">
      <Collapsible open={open} onOpenChange={setOpen} className="space-y-4">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            className="rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Drag field"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <span className="truncate text-sm font-medium">{fieldTitle}</span>
          <Badge variant="secondary">{field.type}</Badge>
          {field.required ? <Badge>required</Badge> : null}
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="ml-auto h-7 w-7 p-0" aria-label="Toggle field settings">
              <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
        <div className="space-y-2">
          <Label>Key</Label>
          <Input
            value={field.key}
            onChange={(event) =>
              onChange(updateFieldAtPath(fields, [index], (current) => ({ ...current, key: event.target.value })))
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Label</Label>
          <Input
            value={field.label}
            onChange={(event) =>
              onChange(updateFieldAtPath(fields, [index], (current) => ({ ...current, label: event.target.value })))
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Type</Label>
          <Combobox
            value={field.type}
            onValueChange={(value) =>
              onChange(
                updateFieldAtPath(fields, [index], (current) => ({
                  ...current,
                  type: value as FieldType,
                  config:
                    value === 'select'
                      ? { ...(current.config ?? {}), options: current.config?.options ?? [] }
                      : value === 'repeater'
                        ? { ...(current.config ?? {}), fields: current.config?.fields ?? [] }
                        : current.config,
                })),
              )
            }
            options={fieldTypeOptions}
            placeholder="Type"
            searchPlaceholder="Search type..."
            className="w-full"
          />
        </div>
        <div className="space-y-2">
          <Label>Required</Label>
          <Button
            type="button"
            variant={field.required ? 'default' : 'outline'}
            className="w-full"
            onClick={() =>
              onChange(updateFieldAtPath(fields, [index], (current) => ({ ...current, required: !current.required })))
            }
          >
            {field.required ? 'Yes' : 'No'}
          </Button>
        </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const next = [...fields];
                next.splice(index + 1, 0, cloneField(field));
                onChange(next);
              }}
            >
              <Copy className="mr-2 h-4 w-4" />
              Duplicate
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => onChange(removeFieldAtPath(fields, [index]))}>
              <Trash2 className="mr-2 h-4 w-4" />
              Remove
            </Button>
          </div>

          {field.type === 'select' ? (
            <div className="space-y-2">
              <Label>Select options</Label>
              <TagInput
            placeholder="Add option"
            tags={tagOptions}
            setTags={(nextTags) => {
              const resolvedTags = typeof nextTags === 'function' ? nextTags(tagOptions) : nextTags;
              onChange(
                updateFieldAtPath(fields, [index], (current) => ({
                  ...current,
                  config: {
                    ...(current.config ?? {}),
                    options: resolvedTags
                      .map((tag) => tag.text.trim())
                      .filter(Boolean),
                  },
                })),
              );
            }}
            activeTagIndex={activeTagIndex}
            setActiveTagIndex={setActiveTagIndex}
            inlineTags
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            styleClasses={{
              inlineTagsContainer:
                'flex min-h-10 w-full flex-wrap items-center gap-2 rounded-md border border-input bg-transparent px-2 py-2 focus-within:ring-1 focus-within:ring-ring',
              tag: {
                body: 'inline-flex items-center gap-1 rounded-md border bg-muted pl-2 pr-1 py-1 text-xs text-foreground',
                closeButton: 'ml-0 rounded-sm p-0.5 hover:bg-accent',
              },
              input: 'h-8 min-w-24 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0',
            }}
              />
            </div>
          ) : null}

          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <Label>Conditional visibility</Label>
              <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setVisibility(
                visibility
                  ? undefined
                  : {
                      relation: 'all',
                      groups: [createDefaultGroup()],
                    },
              )
            }
          >
            {visibility ? 'Disable logic' : 'Enable logic'}
              </Button>
            </div>

            {visibility ? (
              <div className="space-y-3">
            <div className="space-y-2">
              <Label>How groups are combined</Label>
              <Combobox
                value={visibility.relation}
                onValueChange={(value) => setVisibility({ ...visibility, relation: value as 'all' | 'any' })}
                options={[...relationOptions]}
                placeholder="Select relation"
                className="w-full"
              />
            </div>

            {visibility.groups.map((group) => (
              <div key={group.id} className="space-y-3 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <div className="w-full space-y-2">
                    <Label>Rules in this group</Label>
                    <Combobox
                      value={group.relation}
                      onValueChange={(value) => updateGroup(group.id, (current) => ({ ...current, relation: value as 'all' | 'any' }))}
                      options={[...relationOptions]}
                      placeholder="Select relation"
                      className="w-full"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="ml-2"
                    onClick={() =>
                      setVisibility({
                        ...visibility,
                        groups: visibility.groups.filter((item) => item.id !== group.id),
                      })
                    }
                    disabled={visibility.groups.length <= 1}
                  >
                    Remove group
                  </Button>
                </div>

                {group.rules.map((rule) => (
                  <div key={rule.id} className="grid gap-2 md:grid-cols-4">
                    <Combobox
                      value={rule.fieldKey}
                      onValueChange={(value) =>
                        updateGroup(group.id, (current) => ({
                          ...current,
                          rules: current.rules.map((item) => (item.id === rule.id ? { ...item, fieldKey: value } : item)),
                        }))
                      }
                      options={ruleFieldOptions}
                      placeholder="Field"
                      searchPlaceholder="Search field..."
                      emptyText="No fields"
                      className="w-full"
                    />
                    <Combobox
                      value={rule.operator}
                      onValueChange={(value) =>
                        updateGroup(group.id, (current) => ({
                          ...current,
                          rules: current.rules.map((item) => (item.id === rule.id ? { ...item, operator: value as ConditionOperator } : item)),
                        }))
                      }
                      options={operatorOptions}
                      placeholder="Operator"
                      className="w-full"
                    />
                    {(() => {
                      const needsValue = rule.operator !== 'is_empty' && rule.operator !== 'is_not_empty';
                      const referencedField = fieldMetaMap.get(rule.fieldKey);
                      const setRuleValue = (nextValue: string) =>
                        updateGroup(group.id, (current) => ({
                          ...current,
                          rules: current.rules.map((item) => (item.id === rule.id ? { ...item, value: nextValue } : item)),
                        }));

                      if (!needsValue) {
                        return <Input value="" placeholder="No value needed" disabled />;
                      }

                      if (referencedField?.type === 'select') {
                        return (
                          <Combobox
                            value={rule.value ?? ''}
                            onValueChange={setRuleValue}
                            options={(referencedField.options ?? []).map((option) => ({ value: option, label: option }))}
                            placeholder="Select value"
                            searchPlaceholder="Search value..."
                            emptyText="No options"
                            className="w-full"
                          />
                        );
                      }

                      if (referencedField?.type === 'boolean') {
                        return (
                          <Combobox
                            value={rule.value ?? ''}
                            onValueChange={setRuleValue}
                            options={[
                              { value: 'true', label: 'true' },
                              { value: 'false', label: 'false' },
                            ]}
                            placeholder="Select value"
                            className="w-full"
                          />
                        );
                      }

                      return (
                        <Input
                          value={rule.value ?? ''}
                          onChange={(event) => setRuleValue(event.target.value)}
                          placeholder="Value"
                          type={referencedField?.type === 'number' ? 'number' : 'text'}
                          inputMode={referencedField?.type === 'number' ? 'decimal' : undefined}
                        />
                      );
                    })()}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        updateGroup(group.id, (current) => ({
                          ...current,
                          rules: current.rules.filter((item) => item.id !== rule.id),
                        }))
                      }
                      disabled={group.rules.length <= 1}
                    >
                      Remove rule
                    </Button>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    updateGroup(group.id, (current) => ({
                      ...current,
                      rules: [...current.rules, createDefaultRule()],
                    }))
                  }
                >
                  Add rule
                </Button>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setVisibility({
                  ...visibility,
                  groups: [...visibility.groups, createDefaultGroup()],
                })
              }
            >
              Add group
            </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">This field is always visible.</p>
            )}
          </div>

          {field.type === 'repeater' ? (
            <div className="space-y-3 rounded-md border border-dashed p-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Repeater Source</Label>
                  <Combobox
                    value={repeaterSource}
                    onValueChange={(next) =>
                      onChange(
                        updateFieldAtPath(fields, [index], (current) => ({
                          ...current,
                          config:
                            next === 'contentType'
                              ? { ...(current.config ?? {}), contentTypeId: current.config?.contentTypeId ?? '', fields: undefined }
                              : { ...(current.config ?? {}), contentTypeId: undefined, fields: current.config?.fields ?? [] },
                        })),
                      )
                    }
                    options={[
                      { value: 'custom', label: 'Custom nested fields' },
                      { value: 'contentType', label: 'Reference content type' },
                    ]}
                    placeholder="Select source"
                    className="w-full"
                  />
                </div>
                {repeaterSource === 'contentType' ? (
                  <div className="space-y-2">
                    <Label>Referenced Content Type</Label>
                    <Combobox
                      value={field.config?.contentTypeId ?? ''}
                      onValueChange={(next) =>
                        onChange(
                          updateFieldAtPath(fields, [index], (current) => ({
                            ...current,
                            config: { ...(current.config ?? {}), contentTypeId: next, fields: undefined },
                          })),
                        )
                      }
                      options={contentTypeOptions}
                      placeholder="Select content type"
                      searchPlaceholder="Search content types..."
                      emptyText="No content types"
                      className="w-full"
                    />
                  </div>
                ) : null}
              </div>

              {repeaterSource === 'custom' ? (
                <>
                  <div className="flex items-center justify-between">
                    <Label>Repeater nested fields</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        onChange(
                          updateFieldAtPath(fields, [index], (current) => ({
                            ...current,
                            config: {
                              ...(current.config ?? {}),
                              fields: [...(current.config?.fields ?? []), createEmptyField()],
                            },
                          })),
                        )
                      }
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add nested field
                    </Button>
                  </div>
                  <FieldBuilder
                    fields={nestedFields}
                    onChange={(nextNested) =>
                      onChange(
                        updateFieldAtPath(fields, [index], (current) => ({
                          ...current,
                          config: { ...(current.config ?? {}), fields: nextNested, contentTypeId: undefined },
                        })),
                      )
                    }
                    availableKeys={availableKeys}
                    fieldMetaMap={fieldMetaMap}
                    contentTypeOptions={contentTypeOptions}
                    contentTypeFieldMap={contentTypeFieldMap}
                    depth={depth + 1}
                  />
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Repeater rows will use fields from the selected content type.
                </p>
              )}
            </div>
          ) : null}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function FieldBuilder({ fields, onChange, availableKeys, fieldMetaMap, contentTypeOptions, contentTypeFieldMap, depth = 0 }: FieldBuilderProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = fields.findIndex((_, index) => `${depth}-${index}` === String(active.id));
    const newIndex = fields.findIndex((_, index) => `${depth}-${index}` === String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    onChange(arrayMove(fields, oldIndex, newIndex));
  }

  return (
    <div className="space-y-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={fields.map((_, index) => `${depth}-${index}`)} strategy={verticalListSortingStrategy}>
          <div className="w-full space-y-3">
            {fields.map((field, index) => (
              <SortableFieldItem
                key={`${depth}-${index}`}
                field={field}
                index={index}
                depth={depth}
                fields={fields}
                onChange={onChange}
                availableKeys={availableKeys}
                fieldMetaMap={fieldMetaMap}
                contentTypeOptions={contentTypeOptions}
                contentTypeFieldMap={contentTypeFieldMap}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

export function ContentTypesPage({ token, workspaceSiteId, sites: _sites }: ContentTypesPageProps) {
  const navigate = useNavigate();
  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const loadContentTypes = useCallback(async () => {
    if (!workspaceSiteId) return;
    setIsLoading(true);
    setError('');
    try {
      const data = await gqlRequest<{ contentTypes: ContentType[] }>(
        token,
        'query($siteId:ID!){ contentTypes(siteId:$siteId){ id siteId name slug fields options } }',
        { siteId: workspaceSiteId },
      );
      setContentTypes(data.contentTypes);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load content types');
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSiteId, token]);

  useEffect(() => {
    void loadContentTypes();
  }, [loadContentTypes]);

  const handleDelete = useCallback(
    async (contentTypeId: string) => {
      if (!workspaceSiteId) return;
      setError('');
      try {
        await gqlRequest(
          token,
          'mutation($id:ID!,$siteId:ID!){ deleteContentType(id:$id,siteId:$siteId) }',
          { id: contentTypeId, siteId: workspaceSiteId },
        );
        await loadContentTypes();
      } catch (deleteError) {
        setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete content type');
      }
    },
    [workspaceSiteId, token, loadContentTypes],
  );

  const handleDuplicate = useCallback(
    async (source: ContentType) => {
      if (!workspaceSiteId) return;
      setError('');
      const slugs = new Set(contentTypes.map((c) => c.slug));
      const names = new Set(contentTypes.map((c) => c.name));
      let newSlug = `${source.slug}-copy`;
      let n = 2;
      while (slugs.has(newSlug)) {
        newSlug = `${source.slug}-copy-${n}`;
        n += 1;
      }
      let newName = `${source.name} (copy)`;
      n = 2;
      while (names.has(newName)) {
        newName = `${source.name} (copy ${n})`;
        n += 1;
      }
      try {
        const fields = JSON.parse(JSON.stringify(source.fields ?? [])) as ContentType['fields'];
        const response = await gqlRequest<{ createContentType: { id: string } }>(
          token,
          'mutation($siteId:ID!,$name:String!,$slug:String!,$fields:[FieldInput!]!,$options:JSON){ createContentType(siteId:$siteId,name:$name,slug:$slug,fields:$fields,options:$options){ id } }',
          {
            siteId: workspaceSiteId,
            name: newName,
            slug: newSlug,
            fields,
            options: source.options ?? {},
          },
        );
        await loadContentTypes();
        navigate(`/content-types/${response.createContentType.id}`);
      } catch (dupError) {
        setError(dupError instanceof Error ? dupError.message : 'Failed to duplicate content type');
      }
    },
    [workspaceSiteId, token, contentTypes, loadContentTypes, navigate],
  );

  const columns = useMemo<ColumnDef<ContentType>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        accessorKey: 'slug',
        header: 'Slug',
        cell: ({ row }) => <span className="text-muted-foreground">/{row.original.slug}</span>,
      },
      {
        id: 'fields',
        header: 'Fields',
        cell: ({ row }) => (row.original.fields?.length ?? 0).toString(),
      },
      {
        id: 'sidebar',
        header: 'Sidebar',
        cell: ({ row }) =>
          row.original.options?.showInSidebar ? (
            <Badge variant="secondary">{row.original.options.sidebarLabel?.trim() || row.original.name}</Badge>
          ) : (
            <Badge variant="outline">Hidden</Badge>
          ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Row actions">
                  <Ellipsis className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => void handleDuplicate(row.original)}>
                  <Copy />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => void handleDelete(row.original.id)}>
                  <Trash2 />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [handleDelete, handleDuplicate],
  );

  return (
    <div className="w-full space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Content Types</CardTitle>
            <CardDescription>Define schemas and fields for the active workspace.</CardDescription>
          </div>
          <Button onClick={() => navigate('/content-types/new')} disabled={!workspaceSiteId}>
            Create Content Type
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <p className="text-sm text-destructive" aria-live="polite">{error}</p> : null}

          {!workspaceSiteId ? (
            <p className="text-sm text-muted-foreground">Select a workspace from the sidebar first.</p>
          ) : (
            <DataTable
              columns={columns}
              data={contentTypes}
              isLoading={isLoading}
              filterColumnId="name"
              filterPlaceholder="Filter by name…"
              headerContent={
                <Button variant="outline" className="ml-auto" onClick={() => void loadContentTypes()} disabled={isLoading}>
                  Refresh
                </Button>
              }
              emptyMessage="No content types in this workspace yet."
              showColumnToggle={false}
              onRowClick={(ct) => navigate(`/content-types/${ct.id}`)}
              rowClickIgnoreColumnIds={['actions']}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ContentTypeEditorPage({ token, workspaceSiteId, sites: _sites, contentTypeId }: ContentTypeEditorPageProps) {
  const navigate = useNavigate();
  const isNew = contentTypeId === 'new' || !contentTypeId;

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [fields, setFields] = useState<ContentField[]>([createEmptyField()]);
  const [allContentTypes, setAllContentTypes] = useState<ContentType[]>([]);
  const [showInSidebar, setShowInSidebar] = useState(false);
  const [sidebarLabel, setSidebarLabel] = useState('');
  const [sidebarOrder, setSidebarOrder] = useState(100);
  const [hasSlug, setHasSlug] = useState(false);
  const [slugFieldKey, setSlugFieldKey] = useState('');

  useEffect(() => {
    if (!workspaceSiteId) return;

    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError('');
      try {
        const data = await gqlRequest<{ contentTypes: ContentType[] }>(
          token,
          'query($siteId:ID!){ contentTypes(siteId:$siteId){ id siteId name slug fields options } }',
          { siteId: workspaceSiteId },
        );
        if (!cancelled) setAllContentTypes(data.contentTypes);
        if (isNew) {
          if (!cancelled) {
            setName('');
            setSlug('');
            setFields([createEmptyField()]);
            setShowInSidebar(false);
            setSidebarLabel('');
            setSidebarOrder(100);
            setHasSlug(false);
            setSlugFieldKey('');
            setError('');
          }
          return;
        }
        const target = data.contentTypes.find((item) => item.id === contentTypeId);
        if (!target) {
          if (!cancelled) setError('Content type not found in this workspace');
          return;
        }
        if (!cancelled) {
          setName(target.name);
          setSlug(target.slug);
          setFields(target.fields?.length ? target.fields : [createEmptyField()]);
          setShowInSidebar(Boolean(target.options?.showInSidebar));
          setSidebarLabel(target.options?.sidebarLabel ?? '');
          setSidebarOrder(target.options?.sidebarOrder ?? 100);
          setHasSlug(Boolean(target.options?.hasSlug));
          setSlugFieldKey(target.options?.slugFieldKey ?? '');
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Failed to load content type');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [workspaceSiteId, contentTypeId, isNew, token]);

  async function handleSave() {
    if (!workspaceSiteId) return;
    setIsSaving(true);
    setError('');
    try {
      if (isNew) {
        await gqlRequest(
          token,
          'mutation($siteId:ID!,$name:String!,$slug:String!,$fields:[FieldInput!]!,$options:JSON){ createContentType(siteId:$siteId,name:$name,slug:$slug,fields:$fields,options:$options){ id } }',
          {
            siteId: workspaceSiteId,
            name,
            slug,
            fields,
            options: { showInSidebar, sidebarLabel, sidebarOrder, hasSlug, slugFieldKey: hasSlug ? slugFieldKey : '' },
          },
        );
      } else {
        await gqlRequest(
          token,
          'mutation($id:ID!,$siteId:ID!,$name:String,$slug:String,$fields:[FieldInput!],$options:JSON){ updateContentType(id:$id,siteId:$siteId,name:$name,slug:$slug,fields:$fields,options:$options){ id } }',
          {
            id: contentTypeId,
            siteId: workspaceSiteId,
            name,
            slug,
            fields,
            options: { showInSidebar, sidebarLabel, sidebarOrder, hasSlug, slugFieldKey: hasSlug ? slugFieldKey : '' },
          },
        );
      }
      navigate('/content-types');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save content type');
    } finally {
      setIsSaving(false);
    }
  }

  const contentTypeOptions = useMemo(
    () => allContentTypes.filter((item) => item.id !== contentTypeId).map((item) => ({ value: item.id, label: item.name })),
    [allContentTypes, contentTypeId],
  );
  const contentTypeFieldMap = useMemo(
    () => new Map(allContentTypes.map((item) => [item.id, item.fields ?? []] as const)),
    [allContentTypes],
  );
  const availableKeys = useMemo(() => flattenFieldKeys(fields, contentTypeFieldMap), [fields, contentTypeFieldMap]);
  const fieldMetaMap = useMemo(() => flattenFieldMeta(fields, new Map(), contentTypeFieldMap), [fields, contentTypeFieldMap]);

  return (
    <div className="w-full space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{isNew ? 'Create Content Type' : 'Edit Content Type'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!workspaceSiteId ? <p className="text-sm text-muted-foreground">Select a workspace from the sidebar first.</p> : null}
          {error ? <p className="text-sm text-destructive" aria-live="polite">{error}</p> : null}

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading content type…</p>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Homepage blocks" />
                </div>
                <div className="space-y-2">
                  <Label>Slug</Label>
                  <Input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="homepage_blocks" />
                </div>
              </div>

              <div className="space-y-3 rounded-md border p-3">
                <Label>Admin Menu (ACF/CPT style)</Label>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Show in Sidebar</Label>
                    <Button
                      type="button"
                      variant={showInSidebar ? 'default' : 'outline'}
                      className="w-full"
                      onClick={() => setShowInSidebar((prev) => !prev)}
                    >
                      {showInSidebar ? 'Enabled' : 'Disabled'}
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <Label>Sidebar Label</Label>
                    <Input
                      value={sidebarLabel}
                      onChange={(event) => setSidebarLabel(event.target.value)}
                      placeholder="Pages"
                      disabled={!showInSidebar}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Menu Order</Label>
                    <Input
                      type="number"
                      value={sidebarOrder}
                      onChange={(event) => setSidebarOrder(Number(event.target.value) || 100)}
                      disabled={!showInSidebar}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-md border p-3">
                <Label>Entry Slug</Label>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Enable slug for entries</Label>
                    <Button
                      type="button"
                      variant={hasSlug ? 'default' : 'outline'}
                      className="w-full"
                      onClick={() => setHasSlug((prev) => !prev)}
                    >
                      {hasSlug ? 'Enabled' : 'Disabled'}
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <Label>Slug source field (optional)</Label>
                    <Combobox
                      value={slugFieldKey}
                      onValueChange={setSlugFieldKey}
                      options={availableKeys.filter(Boolean).map((key) => ({ value: key, label: key }))}
                      placeholder={hasSlug ? 'Select source field' : 'Slug disabled'}
                      searchPlaceholder="Search fields..."
                      emptyText="No fields"
                      className="w-full"
                      disabled={!hasSlug}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Fields</Label>
                  <Button type="button" variant="outline" onClick={() => setFields([...fields, createEmptyField()])}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add field
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Drag using the handle to reorder fields. Use conditional visibility for advanced ACF-style logic.</p>
                <FieldBuilder
                  fields={fields}
                  onChange={setFields}
                  availableKeys={availableKeys}
                  fieldMetaMap={fieldMetaMap}
                  contentTypeOptions={contentTypeOptions}
                  contentTypeFieldMap={contentTypeFieldMap}
                />
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => navigate('/content-types')}>
                  Cancel
                </Button>
                <Button onClick={() => void handleSave()} disabled={!workspaceSiteId || isSaving}>
                  {isSaving ? 'Saving…' : 'Save Content Type'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
