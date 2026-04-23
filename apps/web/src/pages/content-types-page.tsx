import {
  forwardRef,
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { TagInput, type Tag } from 'emblor-maintained';
import { ChevronDown, Copy, Ellipsis, GripVertical, Plus, Settings2, Trash2 } from 'lucide-react';
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
import { LoadErrorAlert } from '@/components/load-error-alert';
import { useUnsavedChangesPrompt } from '@/hooks/use-unsaved-changes-prompt';
import { buildPageTitle, useDocumentTitle } from '@/lib/page-title';
import { stableJsonStringify } from '@/lib/stable-json';
import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Combobox } from '@/components/ui/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Item } from '@/components/ui/item';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
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
  { value: 'wysiwyg', label: 'wysiwyg' },
  { value: 'url', label: 'url' },
  { value: 'number', label: 'number' },
  { value: 'boolean', label: 'boolean' },
  { value: 'date', label: 'date' },
  { value: 'select', label: 'select' },
  { value: 'image', label: 'image' },
  { value: 'repeater', label: 'repeater' },
  { value: 'entries', label: 'entries' },
];

const relationOptions = [
  { value: 'all', label: 'AND' },
  { value: 'any', label: 'OR' },
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

function slugifyContentTypeName(value: string): string {
  const s = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'type';
}

function uniqueContentTypeSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
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
      contentTypeId: field.config?.contentTypeId,
      mode: field.config?.mode,
      limit: field.config?.limit,
      maxItems: field.config?.maxItems,
      sortBy: field.config?.sortBy,
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

function getFieldAtPath(fields: ContentField[], path: number[]): ContentField | undefined {
  const [i, ...rest] = path;
  if (i === undefined || i < 0) return undefined;
  const f = fields[i];
  if (!rest.length) return f;
  return getFieldAtPath(f.config?.fields ?? [], rest);
}

function insertFieldAfterPath(fields: ContentField[], path: number[], newField: ContentField): ContentField[] {
  const parentPath = path.slice(0, -1);
  const idx = path[path.length - 1];
  if (parentPath.length === 0) {
    const next = [...fields];
    next.splice(idx + 1, 0, newField);
    return next;
  }
  return updateFieldAtPath(fields, parentPath, (parent) => {
    const nested = parent.config?.fields ?? [];
    const nextNested = [...nested];
    nextNested.splice(idx + 1, 0, newField);
    return { ...parent, config: { ...parent.config, fields: nextNested } };
  });
}

/** Replace the fields array at root (`parentPath` empty) or under the repeater at `parentPath`. */
function updateFieldsArrayAtPath(
  fields: ContentField[],
  parentPath: number[],
  update: (children: ContentField[]) => ContentField[],
): ContentField[] {
  if (parentPath.length === 0) {
    return update(fields);
  }
  return updateFieldAtPath(fields, parentPath, (parent) => ({
    ...parent,
    config: {
      ...parent.config,
      fields: update(parent.config?.fields ?? []),
    },
  }));
}

function createFieldMetaVersion(map: Map<string, { type: FieldType; options?: string[] }>): string {
  let out = '';
  for (const [key, meta] of map) {
    const options = meta.options?.join('\u001f') ?? '';
    out += `${key}\u001e${meta.type}\u001d${options}\u001c`;
  }
  return out;
}

type BufferedInputProps = Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'> & {
  value: string;
  onCommit: (nextValue: string) => void;
};

function BufferedInput({ value, onCommit, onBlur, onKeyDown, ...props }: BufferedInputProps) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = useCallback(() => {
    if (draft !== value) onCommit(draft);
  }, [draft, value, onCommit]);

  return (
    <Input
      {...props}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => {
        commit();
        onBlur?.(event);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          commit();
          event.currentTarget.blur();
        }
        onKeyDown?.(event);
      }}
    />
  );
}

type RelationToggleProps = {
  value: 'all' | 'any';
  onChange: (next: 'all' | 'any') => void;
  ariaLabel: string;
};

function RelationToggle({ value, onChange, ariaLabel }: RelationToggleProps) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={value}
      onValueChange={(nextValue) => {
        if (nextValue === 'all' || nextValue === 'any') onChange(nextValue);
      }}
      aria-label={ariaLabel}
    >
      {relationOptions.map((option) => {
        return (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
          >
            {option.label}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
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
  pathPrefixStr: string;
  fields: ContentField[];
  setRootFields: React.Dispatch<React.SetStateAction<ContentField[]>>;
  availableKeys: string[];
  availableKeysVersion: string;
  fieldMetaMap: Map<string, { type: FieldType; options?: string[] }>;
  fieldMetaVersion: string;
  contentTypeOptions: { value: string; label: string }[];
  contentTypeFieldMap: Map<string, ContentField[]>;
  depth?: number;
};

type SortableFieldItemProps = {
  field: ContentField;
  index: number;
  pathPrefixStr: string;
  depth: number;
  setRootFields: React.Dispatch<React.SetStateAction<ContentField[]>>;
  availableKeys: string[];
  availableKeysVersion: string;
  fieldMetaMap: Map<string, { type: FieldType; options?: string[] }>;
  fieldMetaVersion: string;
  contentTypeOptions: { value: string; label: string }[];
  contentTypeFieldMap: Map<string, ContentField[]>;
};

function sortableFieldItemPropsEqual(prev: SortableFieldItemProps, next: SortableFieldItemProps): boolean {
  return (
    prev.field === next.field &&
    prev.index === next.index &&
    prev.pathPrefixStr === next.pathPrefixStr &&
    prev.depth === next.depth &&
    prev.setRootFields === next.setRootFields &&
    prev.contentTypeOptions === next.contentTypeOptions &&
    prev.contentTypeFieldMap === next.contentTypeFieldMap &&
    prev.availableKeysVersion === next.availableKeysVersion &&
    prev.fieldMetaVersion === next.fieldMetaVersion
  );
}

const SortableFieldItem = memo(function SortableFieldItem({
  field,
  index,
  pathPrefixStr,
  depth,
  setRootFields,
  availableKeys,
  availableKeysVersion,
  fieldMetaMap,
  fieldMetaVersion,
  contentTypeOptions,
  contentTypeFieldMap,
}: SortableFieldItemProps) {
  const fieldPath = useMemo(() => {
    if (!pathPrefixStr) return [index];
    return [...pathPrefixStr.split('-').map(Number), index];
  }, [pathPrefixStr, index]);

  const sortableId = pathPrefixStr ? `${pathPrefixStr}-${index}` : String(index);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sortableId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.8 : 1,
  };

  const fieldTitle = field.label || field.key || `Field ${index + 1}`;
  const tagOptions: Tag[] = useMemo(
    () =>
      (field.config?.options ?? []).map((option, optionIndex) => ({
        id: `${field.key || 'option'}-${optionIndex}`,
        text: option,
      })),
    [field.config?.options, field.key],
  );
  const [activeTagIndex, setActiveTagIndex] = useState<number | null>(null);
  const repeaterSource = field.config && 'contentTypeId' in field.config ? 'contentType' : 'custom';
  const nestedFields = repeaterSource === 'contentType'
    ? (contentTypeFieldMap.get(field.config?.contentTypeId ?? '') ?? [])
    : (field.config?.fields ?? []);
  const visibility = field.config?.visibility;
  /** Collapsed by default so heavy controls stay unmounted; first top-level row starts open for discoverability. */
  const [open, setOpen] = useState(depth === 0 && index === 0);
  const ruleFieldOptions = useMemo(
    () =>
      availableKeys
        .filter((key) => key && key !== field.key)
        .map((key) => ({ value: key, label: key })),
    [availableKeys, field.key],
  );
  const comboboxRowClass = 'w-full';

  const setVisibility = (next: VisibilityConfig | undefined) =>
    setRootFields((prev) =>
      updateFieldAtPath(prev, fieldPath, (current) => ({
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
    <div ref={setNodeRef} style={style}>
      <Collapsible open={open} onOpenChange={setOpen} className="block">
        <Card className="gap-0 overflow-hidden border-border bg-background p-0 shadow-sm">
          <CardHeader className="relative mb-0 space-y-0 border-b border-border px-4 py-3 sm:px-5">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="absolute inset-0 z-0 rounded-t-xl hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                aria-label={`Toggle ${fieldTitle}`}
              />
            </CollapsibleTrigger>
            <div className="relative z-10 flex min-w-0 items-center gap-2 pointer-events-none">
              <button
                type="button"
                className="relative z-20 shrink-0 rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-events-auto"
                aria-label="Drag field"
                {...attributes}
                {...listeners}
              >
                <GripVertical className="h-4 w-4" />
              </button>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 pointer-events-none">
                <CardTitle className="shrink-0 text-base font-semibold leading-snug tracking-tight">{fieldTitle}</CardTitle>
                {!open ? (
                  <>
                    <Badge variant="secondary" className="shrink-0">
                      {field.type}
                    </Badge>
                    {field.required ? <Badge className="shrink-0">required</Badge> : null}
                  </>
                ) : null}
              </div>
              <CardAction className="gap-0.5">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label="Field actions">
                      <Ellipsis className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuGroup>
                      <DropdownMenuItem
                        onClick={() => {
                          setRootFields((prev) => {
                            const target = getFieldAtPath(prev, fieldPath);
                            if (!target) return prev;
                            return insertFieldAfterPath(prev, fieldPath, cloneField(target));
                          });
                        }}
                      >
                        <Copy />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={() => setRootFields((prev) => removeFieldAtPath(prev, fieldPath))}>
                        <Trash2 />
                        Remove
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label="Toggle field settings">
                    <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </Button>
                </CollapsibleTrigger>
              </CardAction>
            </div>
          </CardHeader>

        {open ? (
        <CardContent className="border-0 px-4 pb-4 pt-4 sm:px-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4">
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
              <Field className="min-w-0">
                <FieldLabel htmlFor={`field-key-${sortableId}`}>Key</FieldLabel>
                <FieldContent>
                  <BufferedInput
                    id={`field-key-${sortableId}`}
                    value={field.key}
                    onCommit={(nextValue) =>
                      setRootFields((prev) =>
                        updateFieldAtPath(prev, fieldPath, (current) => ({ ...current, key: nextValue })),
                      )
                    }
                  />
                </FieldContent>
              </Field>
              <Field className="min-w-0">
                <FieldLabel htmlFor={`field-label-${sortableId}`}>Label</FieldLabel>
                <FieldContent>
                  <BufferedInput
                    id={`field-label-${sortableId}`}
                    value={field.label}
                    onCommit={(nextValue) =>
                      setRootFields((prev) =>
                        updateFieldAtPath(prev, fieldPath, (current) => ({ ...current, label: nextValue })),
                      )
                    }
                  />
                </FieldContent>
              </Field>
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
              <Field className="min-w-0">
                <FieldLabel htmlFor={`field-type-${sortableId}`}>Type</FieldLabel>
                <FieldContent>
                  <Combobox
                    id={`field-type-${sortableId}`}
                    value={field.type}
                    onValueChange={(value) =>
                      setRootFields((prev) =>
                        updateFieldAtPath(prev, fieldPath, (current) => ({
                          ...current,
                          type: value as FieldType,
                          config:
                            value === 'select'
                              ? { ...(current.config ?? {}), options: current.config?.options ?? [] }
                              : value === 'repeater'
                                ? { ...(current.config ?? {}), fields: current.config?.fields ?? [] }
                                : value === 'entries'
                                  ? {
                                      contentTypeId: current.config?.contentTypeId ?? '',
                                      mode: current.config?.mode === 'latest' ? 'latest' : 'manual',
                                      limit: typeof current.config?.limit === 'number' ? current.config.limit : 5,
                                      maxItems:
                                        typeof current.config?.maxItems === 'number' ? current.config.maxItems : 10,
                                      sortBy: current.config?.sortBy === 'createdAt' ? 'createdAt' : 'updatedAt',
                                    }
                                  : current.config,
                        })),
                      )
                    }
                    options={fieldTypeOptions}
                    placeholder="Type"
                    searchPlaceholder="Search type..."
                    className={comboboxRowClass}
                  />
                </FieldContent>
              </Field>
              <Field className="min-w-0">
                <FieldLabel htmlFor={`field-required-${sortableId}`}>Required</FieldLabel>
                <FieldContent>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id={`field-required-${sortableId}`}
                      className="mt-0.5 shrink-0"
                      checked={field.required}
                      onCheckedChange={(checked) =>
                        setRootFields((prev) =>
                          updateFieldAtPath(prev, fieldPath, (current) => ({ ...current, required: checked === true })),
                        )
                      }
                    />
                    <FieldDescription className="min-w-0 flex-1">
                      Mark as required.
                    </FieldDescription>
                  </div>
                </FieldContent>
              </Field>
            </div>
          </div>

          {field.type === 'select' ? (
            <Field>
              <FieldLabel>Select options</FieldLabel>
              <FieldContent>
                <TagInput
                  placeholder="Add option"
                  tags={tagOptions}
                  setTags={(nextTags) => {
                    const resolvedTags = typeof nextTags === 'function' ? nextTags(tagOptions) : nextTags;
                    setRootFields((prev) =>
                      updateFieldAtPath(prev, fieldPath, (current) => ({
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
              </FieldContent>
              <FieldDescription>Available options for this field.</FieldDescription>
            </Field>
          ) : null}

          <Sheet>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
              <div className="min-w-0">
                <FieldTitle>Conditional visibility</FieldTitle>
                <FieldDescription className="text-xs">
                  {visibility
                    ? `${visibility.groups.length} group${visibility.groups.length === 1 ? '' : 's'} configured`
                    : 'Default visibility.'}
                </FieldDescription>
              </div>
              <SheetTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  {visibility ? 'Edit logic' : 'Set logic'}
                </Button>
              </SheetTrigger>
            </div>

            <SheetContent
              side="right"
              className="w-full p-0 sm:max-w-2xl"
              onInteractOutside={(event) => {
                const target = event.target as HTMLElement | null;
                if (target?.closest?.('[data-slot=combobox-content]')) {
                  event.preventDefault();
                }
              }}
            >
              <SheetHeader className="border-b">
                <SheetTitle>Conditional Visibility Rules</SheetTitle>
                <SheetDescription>
                  Visibility logic and field rules.
                </SheetDescription>
              </SheetHeader>
              <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <FieldTitle>Conditional visibility</FieldTitle>
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
                  <div className="flex flex-col gap-3">
            <Field orientation="horizontal" className="items-center justify-between gap-3">
              <FieldLabel>Logic operator</FieldLabel>
              <RelationToggle
                value={visibility.relation}
                onChange={(value) => setVisibility({ ...visibility, relation: value })}
                ariaLabel="How groups are combined"
              />
            </Field>

            {visibility.groups.map((group) => (
              <Item key={group.id} variant="muted" className="w-full flex-col flex-nowrap items-stretch gap-3 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <RelationToggle
                      value={group.relation}
                      onChange={(value) => updateGroup(group.id, (current) => ({ ...current, relation: value }))}
                      ariaLabel="Rules in this group"
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
                  <div key={rule.id} className="flex min-w-0 items-stretch gap-2">
                    <div className="grid min-w-0 flex-1 grid-cols-1 overflow-hidden rounded-2xl border border-input bg-background md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
                      <div className="min-w-0 border-b border-input md:border-r md:border-b-0">
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
                          className="h-9 min-w-0 w-full rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
                        />
                      </div>
                      <div className="min-w-0 border-b border-input md:border-r md:border-b-0">
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
                          className="h-9 min-w-0 w-full rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
                        />
                      </div>
                      <div className="min-w-0">
                        {(() => {
                          const needsValue = rule.operator !== 'is_empty' && rule.operator !== 'is_not_empty';
                          const referencedField = fieldMetaMap.get(rule.fieldKey);
                          const setRuleValue = (nextValue: string) =>
                            updateGroup(group.id, (current) => ({
                              ...current,
                              rules: current.rules.map((item) => (item.id === rule.id ? { ...item, value: nextValue } : item)),
                            }));

                          if (!needsValue) {
                            return (
                              <Input
                                value=""
                                placeholder="No value needed"
                                disabled
                                className="h-9 min-w-0 w-full rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
                              />
                            );
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
                                className="h-9 min-w-0 w-full rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
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
                                className="h-9 min-w-0 w-full rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
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
                              className="h-9 min-w-0 w-full rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
                            />
                          );
                        })()}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove rule"
                      className="h-9 w-9 shrink-0"
                      onClick={() =>
                        updateGroup(group.id, (current) => ({
                          ...current,
                          rules: current.rules.filter((item) => item.id !== rule.id),
                        }))
                      }
                      disabled={group.rules.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="self-start text-primary"
                  onClick={() =>
                    updateGroup(group.id, (current) => ({
                      ...current,
                      rules: [...current.rules, createDefaultRule()],
                    }))
                  }
                >
                  <Plus className="h-4 w-4" />
                  Add rule
                </Button>
              </Item>
            ))}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start text-primary"
              onClick={() =>
                setVisibility({
                  ...visibility,
                  groups: [...visibility.groups, createDefaultGroup()],
                })
              }
            >
              <Plus className="h-4 w-4" />
              Add group
            </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">This field is always visible.</p>
                )}
              </div>
            </SheetContent>
          </Sheet>

          {field.type === 'repeater' ? (
            <div className="flex flex-col gap-3 rounded-md border border-dashed p-3">
              <div className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor={`repeater-source-${sortableId}`}>Repeater source</FieldLabel>
                  <FieldContent>
                  <Combobox
                    id={`repeater-source-${sortableId}`}
                    value={repeaterSource}
                    onValueChange={(next) =>
                      setRootFields((prev) =>
                        updateFieldAtPath(prev, fieldPath, (current) => ({
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
                    className={comboboxRowClass}
                  />
                  </FieldContent>
                </Field>
                {repeaterSource === 'contentType' ? (
                  <Field>
                    <FieldLabel htmlFor={`repeater-ref-ct-${sortableId}`}>Referenced content type</FieldLabel>
                    <FieldContent>
                    <Combobox
                      id={`repeater-ref-ct-${sortableId}`}
                      value={field.config?.contentTypeId ?? ''}
                      onValueChange={(next) =>
                        setRootFields((prev) =>
                          updateFieldAtPath(prev, fieldPath, (current) => ({
                            ...current,
                            config: { ...(current.config ?? {}), contentTypeId: next, fields: undefined },
                          })),
                        )
                      }
                      options={contentTypeOptions}
                      placeholder="Select content type"
                      searchPlaceholder="Search content types..."
                      emptyText="No content types"
                      className={comboboxRowClass}
                    />
                    </FieldContent>
                  </Field>
                ) : null}
              </div>

              {repeaterSource === 'custom' ? (
                <div className="flex flex-col gap-3">
                  <FieldTitle>Repeater nested fields</FieldTitle>
                  <FieldBuilder
                    pathPrefixStr={fieldPath.join('-')}
                    fields={nestedFields}
                    setRootFields={setRootFields}
                    availableKeys={availableKeys}
                    availableKeysVersion={availableKeysVersion}
                    fieldMetaMap={fieldMetaMap}
                    fieldMetaVersion={fieldMetaVersion}
                    contentTypeOptions={contentTypeOptions}
                    contentTypeFieldMap={contentTypeFieldMap}
                    depth={depth + 1}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="self-start text-primary"
                    onClick={() =>
                      setRootFields((prev) =>
                        updateFieldAtPath(prev, fieldPath, (current) => ({
                          ...current,
                          config: {
                            ...(current.config ?? {}),
                            fields: [...(current.config?.fields ?? []), createEmptyField()],
                          },
                        })),
                      )
                    }
                  >
                    <Plus className="h-4 w-4" />
                    Add nested field
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Repeater rows will use fields from the selected content type.
                </p>
              )}
            </div>
          ) : null}

          {field.type === 'entries' ? (
            <div className="flex flex-col gap-4 rounded-md border border-dashed p-3">
              <Field>
                <FieldLabel htmlFor={`entries-ref-ct-${sortableId}`}>Linked content type</FieldLabel>
                <FieldContent>
                  <Combobox
                    id={`entries-ref-ct-${sortableId}`}
                    value={field.config?.contentTypeId ?? ''}
                    onValueChange={(next) =>
                      setRootFields((prev) =>
                        updateFieldAtPath(prev, fieldPath, (current) => ({
                          ...current,
                          config: { ...(current.config ?? {}), contentTypeId: next },
                        })),
                      )
                    }
                    options={contentTypeOptions}
                    placeholder="Select type (e.g. projects)"
                    searchPlaceholder="Search types…"
                    emptyText="No other types yet"
                    className={comboboxRowClass}
                  />
                </FieldContent>
                <FieldDescription>Entries shown in the editor come from this type (same site).</FieldDescription>
              </Field>

              <div className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor={`entries-mode-${sortableId}`}>Selection mode</FieldLabel>
                  <FieldContent>
                    <Combobox
                      id={`entries-mode-${sortableId}`}
                      value={field.config?.mode === 'latest' ? 'latest' : 'manual'}
                      onValueChange={(next) =>
                        setRootFields((prev) =>
                          updateFieldAtPath(prev, fieldPath, (current) => ({
                            ...current,
                            config: {
                              ...(current.config ?? {}),
                              mode: next === 'latest' ? 'latest' : 'manual',
                            },
                          })),
                        )
                      }
                      options={[
                        { value: 'manual', label: 'Pick specific entries' },
                        { value: 'latest', label: 'Latest N (automatic)' },
                      ]}
                      placeholder="Mode"
                      className={comboboxRowClass}
                    />
                  </FieldContent>
                </Field>

                {field.config?.mode === 'latest' ? (
                  <Field>
                    <FieldLabel htmlFor={`entries-limit-${sortableId}`}>How many</FieldLabel>
                    <FieldContent>
                      <Input
                        id={`entries-limit-${sortableId}`}
                        type="number"
                        min={1}
                        max={50}
                        value={field.config?.limit ?? 5}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          setRootFields((prev) =>
                            updateFieldAtPath(prev, fieldPath, (current) => ({
                              ...current,
                              config: {
                                ...(current.config ?? {}),
                                limit: Number.isFinite(n) ? Math.min(50, Math.max(1, Math.floor(n))) : 5,
                              },
                            })),
                          );
                        }}
                      />
                    </FieldContent>
                  </Field>
                ) : (
                  <Field>
                    <FieldLabel htmlFor={`entries-max-${sortableId}`}>Max picks</FieldLabel>
                    <FieldContent>
                      <Input
                        id={`entries-max-${sortableId}`}
                        type="number"
                        min={1}
                        max={50}
                        value={field.config?.maxItems ?? 10}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          setRootFields((prev) =>
                            updateFieldAtPath(prev, fieldPath, (current) => ({
                              ...current,
                              config: {
                                ...(current.config ?? {}),
                                maxItems: Number.isFinite(n) ? Math.min(50, Math.max(1, Math.floor(n))) : 10,
                              },
                            })),
                          );
                        }}
                      />
                    </FieldContent>
                  </Field>
                )}
              </div>

              {field.config?.mode === 'latest' ? (
                <Field>
                  <FieldLabel htmlFor={`entries-sort-${sortableId}`}>Sort by</FieldLabel>
                  <FieldContent>
                    <Combobox
                      id={`entries-sort-${sortableId}`}
                      value={field.config?.sortBy === 'createdAt' ? 'createdAt' : 'updatedAt'}
                      onValueChange={(next) =>
                        setRootFields((prev) =>
                          updateFieldAtPath(prev, fieldPath, (current) => ({
                            ...current,
                            config: {
                              ...(current.config ?? {}),
                              sortBy: next === 'createdAt' ? 'createdAt' : 'updatedAt',
                            },
                          })),
                        )
                      }
                      options={[
                        { value: 'updatedAt', label: 'Last updated' },
                        { value: 'createdAt', label: 'Created date' },
                      ]}
                      placeholder="Sort"
                      className={comboboxRowClass}
                    />
                  </FieldContent>
                  <FieldDescription>
                    Resolved when the API reads this entry (not stored as ids). Exclude the current entry if it matches
                    the linked type.
                  </FieldDescription>
                </Field>
              ) : null}
            </div>
          ) : null}
        </div>
        </CardContent>
        ) : null}
        </Card>
      </Collapsible>
    </div>
  );
}, sortableFieldItemPropsEqual);

function FieldBuilder({
  pathPrefixStr,
  fields,
  setRootFields,
  availableKeys,
  availableKeysVersion,
  fieldMetaMap,
  fieldMetaVersion,
  contentTypeOptions,
  contentTypeFieldMap,
  depth = 0,
}: FieldBuilderProps) {
  const parentPath = useMemo(
    () => (pathPrefixStr ? pathPrefixStr.split('-').map((part) => Number(part)) : []),
    [pathPrefixStr],
  );

  const itemId = useCallback((i: number) => (pathPrefixStr ? `${pathPrefixStr}-${i}` : String(i)), [pathPrefixStr]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = fields.findIndex((_, index) => itemId(index) === String(active.id));
    const newIndex = fields.findIndex((_, index) => itemId(index) === String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    setRootFields((prev) =>
      updateFieldsArrayAtPath(prev, parentPath, (children) => arrayMove(children, oldIndex, newIndex)),
    );
  }

  return (
    <div className="space-y-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={fields.map((_, index) => itemId(index))} strategy={verticalListSortingStrategy}>
          <div className="w-full space-y-3">
            {fields.map((field, index) => (
              <SortableFieldItem
                key={itemId(index)}
                field={field}
                index={index}
                pathPrefixStr={pathPrefixStr}
                depth={depth}
                setRootFields={setRootFields}
                availableKeys={availableKeys}
                availableKeysVersion={availableKeysVersion}
                fieldMetaMap={fieldMetaMap}
                fieldMetaVersion={fieldMetaVersion}
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

export function ContentTypesPage({ token, workspaceSiteId, sites }: ContentTypesPageProps) {
  const siteTitle = sites.find((s) => s.id === workspaceSiteId)?.name?.trim() || 'Workspace';
  useDocumentTitle(buildPageTitle('Content types', siteTitle));
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
        meta: { compact: true },
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
          {error ? (
            <LoadErrorAlert title="Content types" message={error} onRetry={() => void loadContentTypes()} />
          ) : null}

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

type ContentTypeSchemaBootstrap = {
  fields: ContentField[];
  hasSlug: boolean;
};

export type ContentTypeSchemaHandle = {
  getSnapshot: () => ContentTypeSchemaBootstrap;
};

type ContentTypeSchemaBlockProps = {
  bootstrap: ContentTypeSchemaBootstrap;
  contentTypeOptions: { value: string; label: string }[];
  contentTypeFieldMap: Map<string, ContentField[]>;
  onSchemaChange?: () => void;
};

function contentTypeSchemaBlockPropsEqual(prev: ContentTypeSchemaBlockProps, next: ContentTypeSchemaBlockProps): boolean {
  return (
    prev.bootstrap === next.bootstrap &&
    prev.contentTypeOptions === next.contentTypeOptions &&
    prev.contentTypeFieldMap === next.contentTypeFieldMap &&
    prev.onSchemaChange === next.onSchemaChange
  );
}

/** Holds fields + entry-slug settings so typing in the schema does not re-render the rest of the editor page. */
const ContentTypeSchemaBlock = memo(
  forwardRef<ContentTypeSchemaHandle, ContentTypeSchemaBlockProps>(function ContentTypeSchemaBlock(
    { bootstrap, contentTypeOptions, contentTypeFieldMap, onSchemaChange },
    ref,
  ) {
    const [fields, setFields] = useState(bootstrap.fields);
    const [hasSlug, setHasSlug] = useState(bootstrap.hasSlug);

    useEffect(() => {
      setFields(bootstrap.fields);
      setHasSlug(bootstrap.hasSlug);
    }, [bootstrap]);

    useEffect(() => {
      onSchemaChange?.();
    }, [fields, hasSlug, onSchemaChange]);

    useImperativeHandle(
      ref,
      () => ({
        getSnapshot: (): ContentTypeSchemaBootstrap => ({ fields, hasSlug }),
      }),
      [fields, hasSlug],
    );

    const deferredFields = useDeferredValue(fields);
    const deferredAvailableKeys = useMemo(
      () => flattenFieldKeys(deferredFields, contentTypeFieldMap),
      [deferredFields, contentTypeFieldMap],
    );
    const deferredFieldMetaMap = useMemo(
      () => flattenFieldMeta(deferredFields, new Map(), contentTypeFieldMap),
      [deferredFields, contentTypeFieldMap],
    );
    const availableKeysVersion = useMemo(() => deferredAvailableKeys.join('\u001f'), [deferredAvailableKeys]);
    const fieldMetaVersion = useMemo(() => createFieldMetaVersion(deferredFieldMetaMap), [deferredFieldMetaMap]);

    return (
      <>
        <Item
          variant="muted"
          className="w-full flex-col flex-nowrap items-stretch"
          role="group"
          aria-label="Entry slug settings"
        >
          <FieldGroup className="w-full gap-4">
            <Field orientation="horizontal" className="items-start gap-3">
              <Checkbox
                id="ct-entry-has-slug"
                checked={hasSlug}
                onCheckedChange={(value) => setHasSlug(value === true)}
              />
              <FieldContent>
                <FieldLabel htmlFor="ct-entry-has-slug">Enable entry slugs</FieldLabel>
                <FieldDescription>Optional URL segments for entries of this type.</FieldDescription>
              </FieldContent>
            </Field>
          </FieldGroup>
        </Item>

        <Item
          variant="muted"
          className="w-full flex-col flex-nowrap items-stretch"
          role="group"
          aria-label="Content type fields"
        >
          <FieldGroup className="flex w-full flex-col gap-3">
            <div className="flex flex-col gap-1">
              <FieldTitle>Fields</FieldTitle>
              <FieldDescription>
                Drag using the handle to reorder. Use conditional visibility for ACF-style rules.
              </FieldDescription>
            </div>
            <FieldBuilder
              pathPrefixStr=""
              fields={fields}
              setRootFields={setFields}
              availableKeys={deferredAvailableKeys}
              availableKeysVersion={availableKeysVersion}
              fieldMetaMap={deferredFieldMetaMap}
              fieldMetaVersion={fieldMetaVersion}
              contentTypeOptions={contentTypeOptions}
              contentTypeFieldMap={contentTypeFieldMap}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start text-primary"
              onClick={() => setFields((prev) => [...prev, createEmptyField()])}
            >
              <Plus className="h-4 w-4" />
              Add field
            </Button>
          </FieldGroup>
        </Item>
      </>
    );
  }),
  contentTypeSchemaBlockPropsEqual,
);

export function ContentTypeEditorPage({ token, workspaceSiteId, sites, contentTypeId }: ContentTypeEditorPageProps) {
  const navigate = useNavigate();
  const isNew = contentTypeId === 'new' || !contentTypeId;
  const siteTitle = sites.find((s) => s.id === workspaceSiteId)?.name?.trim() || 'Workspace';

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [name, setName] = useState('');
  /** Immutable URL key after save; only used when editing an existing type */
  const [committedSlug, setCommittedSlug] = useState('');
  const [allContentTypes, setAllContentTypes] = useState<ContentType[]>([]);
  const [showInSidebar, setShowInSidebar] = useState(false);
  const [sidebarLabel, setSidebarLabel] = useState('');
  const [sidebarOrder, setSidebarOrder] = useState(100);
  const [schemaBootstrap, setSchemaBootstrap] = useState<ContentTypeSchemaBootstrap | null>(null);
  const schemaRef = useRef<ContentTypeSchemaHandle | null>(null);

  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [schemaTick, setSchemaTick] = useState(0);
  const bumpSchema = useCallback(() => setSchemaTick((t) => t + 1), []);

  const editorDocTitle = useMemo(
    () =>
      buildPageTitle(
        isNew ? 'New content type' : name.trim() || 'Content type',
        'Content types',
        siteTitle,
      ),
    [isNew, name, siteTitle],
  );
  useDocumentTitle(editorDocTitle);

  useLayoutEffect(() => {
    if (isLoading || !schemaBootstrap) {
      setSavedSnapshot(null);
      return;
    }
    const schema = schemaRef.current?.getSnapshot();
    setSavedSnapshot(
      stableJsonStringify({
        name: name.trim(),
        showInSidebar,
        sidebarLabel,
        sidebarOrder,
        schema,
      }),
    );
  }, [isLoading, schemaBootstrap, contentTypeId, workspaceSiteId]);

  const currentSnapshot = useMemo(() => {
    const schema = schemaRef.current?.getSnapshot();
    return stableJsonStringify({
      name: name.trim(),
      showInSidebar,
      sidebarLabel,
      sidebarOrder,
      schema,
    });
  }, [name, showInSidebar, sidebarLabel, sidebarOrder, schemaTick, schemaBootstrap]);

  const isDirty = savedSnapshot !== null && currentSnapshot !== savedSnapshot;
  const unsavedPrompt = useUnsavedChangesPrompt({ isDirty });

  useEffect(() => {
    if (!workspaceSiteId) {
      setSchemaBootstrap(null);
      return;
    }

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
            setCommittedSlug('');
            setShowInSidebar(false);
            setSidebarLabel('');
            setSidebarOrder(100);
            setError('');
            setSchemaBootstrap({
              fields: [createEmptyField()],
              hasSlug: false,
            });
          }
          return;
        }
        const target = data.contentTypes.find((item) => item.id === contentTypeId);
        if (!target) {
          if (!cancelled) {
            setError('Content type not found in this workspace');
            setSchemaBootstrap(null);
          }
          return;
        }
        if (!cancelled) {
          setName(target.name);
          setCommittedSlug(target.slug);
          setShowInSidebar(Boolean(target.options?.showInSidebar));
          setSidebarLabel(target.options?.sidebarLabel ?? '');
          setSidebarOrder(target.options?.sidebarOrder ?? 100);
          setSchemaBootstrap({
            fields: target.fields?.length ? target.fields : [createEmptyField()],
            hasSlug: Boolean(target.options?.hasSlug),
          });
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
  }, [workspaceSiteId, contentTypeId, isNew, token, reloadKey]);

  async function handleSave() {
    if (!workspaceSiteId) return;
    if (isNew && !name.trim()) {
      setError('Name is required');
      return;
    }
    const schema = schemaRef.current?.getSnapshot();
    if (!schema) {
      setError('Schema is not ready to save');
      return;
    }
    const { fields, hasSlug } = schema;
    setIsSaving(true);
    setError('');
    try {
      const taken = new Set(allContentTypes.map((c) => c.slug).filter(Boolean));
      if (isNew) {
        const slug = uniqueContentTypeSlug(slugifyContentTypeName(name), taken);
        await gqlRequest(
          token,
          'mutation($siteId:ID!,$name:String!,$slug:String!,$fields:[FieldInput!]!,$options:JSON){ createContentType(siteId:$siteId,name:$name,slug:$slug,fields:$fields,options:$options){ id } }',
          {
            siteId: workspaceSiteId,
            name: name.trim(),
            slug,
            fields,
            options: { showInSidebar, sidebarLabel, sidebarOrder, hasSlug, slugFieldKey: '' },
          },
        );
      } else {
        await gqlRequest(
          token,
          'mutation($id:ID!,$siteId:ID!,$name:String,$fields:[FieldInput!],$options:JSON){ updateContentType(id:$id,siteId:$siteId,name:$name,fields:$fields,options:$options){ id } }',
          {
            id: contentTypeId,
            siteId: workspaceSiteId,
            name: name.trim(),
            fields,
            options: { showInSidebar, sidebarLabel, sidebarOrder, hasSlug, slugFieldKey: '' },
          },
        );
      }
      const schemaAfterSave = schemaRef.current?.getSnapshot();
      const snap = stableJsonStringify({
        name: name.trim(),
        showInSidebar,
        sidebarLabel,
        sidebarOrder,
        schema: schemaAfterSave,
      });
      flushSync(() => {
        setSavedSnapshot(snap);
      });
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

  const takenSlugs = useMemo(
    () => new Set(allContentTypes.map((c) => c.slug).filter(Boolean)),
    [allContentTypes],
  );
  const derivedBaseSlug = useMemo(() => slugifyContentTypeName(name), [name]);
  const displaySlug = useMemo(() => {
    if (!isNew) return committedSlug;
    return uniqueContentTypeSlug(derivedBaseSlug, takenSlugs);
  }, [isNew, committedSlug, derivedBaseSlug, takenSlugs]);

  return (
    <>
      {unsavedPrompt}
      <div className="w-full space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <CardTitle>{isNew ? 'Create Content Type' : 'Edit Content Type'}</CardTitle>
          <Dialog>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                aria-label="Admin menu settings"
                disabled={!workspaceSiteId || isLoading}
              >
                <Settings2 />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Admin menu</DialogTitle>
                <DialogDescription>
                  Control how this content type appears in the workspace sidebar (similar to WordPress custom post types).
                </DialogDescription>
              </DialogHeader>
              <FieldGroup>
                <Field orientation="horizontal" className="items-start gap-3">
                  <Checkbox
                    id="ct-admin-show-sidebar"
                    checked={showInSidebar}
                    onCheckedChange={(value) => setShowInSidebar(value === true)}
                  />
                  <FieldContent>
                      <FieldLabel htmlFor="ct-admin-show-sidebar">Show in sidebar</FieldLabel>
                    <FieldDescription>List this type in the CMS sidebar for quick access.</FieldDescription>
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel htmlFor="ct-admin-sidebar-label">Sidebar label</FieldLabel>
                  <FieldContent>
                    <Input
                      id="ct-admin-sidebar-label"
                      value={sidebarLabel}
                      onChange={(event) => setSidebarLabel(event.target.value)}
                      placeholder="Pages"
                      disabled={!showInSidebar}
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel htmlFor="ct-admin-menu-order">Menu order</FieldLabel>
                  <FieldContent>
                    <Input
                      id="ct-admin-menu-order"
                      type="number"
                      value={sidebarOrder}
                      onChange={(event) => setSidebarOrder(Number(event.target.value) || 100)}
                      disabled={!showInSidebar}
                    />
                  </FieldContent>
                  <FieldDescription>Lower numbers appear higher in the sidebar list.</FieldDescription>
                </Field>
              </FieldGroup>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {!workspaceSiteId ? <p className="text-sm text-muted-foreground">Select a workspace from the sidebar first.</p> : null}
          {error ? (
            <LoadErrorAlert
              title="Content type"
              message={error}
              onRetry={() => {
                setError('');
                setReloadKey((k) => k + 1);
              }}
            />
          ) : null}

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading content type…</p>
          ) : schemaBootstrap ? (
            <FieldGroup>
              <Item
                variant="muted"
                className="w-full flex-col flex-nowrap items-stretch"
                role="group"
                aria-label="Content type name and URL key"
              >
                <Field className="w-full">
                  <FieldLabel htmlFor="ct-name">Name</FieldLabel>
                  <FieldContent>
                    <Input
                      id="ct-name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Homepage blocks"
                    />
                  </FieldContent>
                  <FieldDescription>
                    URL key for routes and the API. {isNew ? 'It is generated from the name when you save.' : 'It cannot be changed after creation.'}
                  </FieldDescription>
                  {displaySlug ? (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">URL key</span>
                      <div
                        className="rounded-md border border-border bg-muted/50 px-3 py-2 font-mono text-sm font-medium text-foreground tabular-nums tracking-tight"
                        aria-live="polite"
                        aria-label={`Content type URL key: ${displaySlug}`}
                      >
                        /{displaySlug}
                      </div>
                    </div>
                  ) : null}
                </Field>
              </Item>

              <ContentTypeSchemaBlock
                ref={schemaRef}
                bootstrap={schemaBootstrap}
                contentTypeOptions={contentTypeOptions}
                contentTypeFieldMap={contentTypeFieldMap}
                onSchemaChange={bumpSchema}
              />

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => navigate('/content-types')}>
                  Cancel
                </Button>
                <Button
                  onClick={() => void handleSave()}
                  disabled={!workspaceSiteId || isSaving || (isNew && !name.trim())}
                >
                  {isSaving ? 'Saving…' : 'Save Content Type'}
                </Button>
              </div>
            </FieldGroup>
          ) : null}
        </CardContent>
      </Card>
    </div>
    </>
  );
}
