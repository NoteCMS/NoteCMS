import { z } from 'zod';
import type { FieldDefinition } from './types.js';

type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'is_empty'
  | 'is_not_empty'
  | 'gt'
  | 'lt';

type VisibilityRule = {
  fieldKey: string;
  operator: ConditionOperator;
  value?: string;
};

type VisibilityGroup = {
  relation: 'all' | 'any';
  rules: VisibilityRule[];
};

type VisibilityConfig = {
  relation: 'all' | 'any';
  groups: VisibilityGroup[];
};

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

function readVisibility(field: FieldDefinition): VisibilityConfig | undefined {
  const raw = field.config?.visibility;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  const groups = obj.groups;
  if (!Array.isArray(groups) || groups.length === 0) return undefined;
  const relation = obj.relation === 'any' ? 'any' : 'all';
  const parsedGroups: VisibilityGroup[] = [];
  for (const g of groups) {
    if (!g || typeof g !== 'object' || Array.isArray(g)) continue;
    const go = g as Record<string, unknown>;
    const gr = go.relation === 'any' ? 'any' : 'all';
    const rulesRaw = go.rules;
    if (!Array.isArray(rulesRaw)) continue;
    const rules: VisibilityRule[] = [];
    for (const r of rulesRaw) {
      if (!r || typeof r !== 'object' || Array.isArray(r)) continue;
      const ro = r as Record<string, unknown>;
      const fieldKey = typeof ro.fieldKey === 'string' ? ro.fieldKey : '';
      const op = ro.operator as ConditionOperator;
      const value = typeof ro.value === 'string' ? ro.value : undefined;
      if (
        op === 'equals' ||
        op === 'not_equals' ||
        op === 'contains' ||
        op === 'not_contains' ||
        op === 'is_empty' ||
        op === 'is_not_empty' ||
        op === 'gt' ||
        op === 'lt'
      ) {
        rules.push({ fieldKey, operator: op, value });
      }
    }
    if (rules.length) parsedGroups.push({ relation: gr, rules });
  }
  if (!parsedGroups.length) return undefined;
  return { relation, groups: parsedGroups };
}

function isFieldVisibleForEntryData(field: FieldDefinition, data: Record<string, unknown>): boolean {
  const visibility = readVisibility(field);
  if (!visibility) return true;

  const evaluateGroup = (group: VisibilityGroup) => {
    const results = group.rules.map((rule) => matchRule(rule.operator, getRuleValue(data, rule.fieldKey), rule.value));
    return group.relation === 'all' ? results.every(Boolean) : results.some(Boolean);
  };

  const groupResults = visibility.groups.map(evaluateGroup);
  return visibility.relation === 'all' ? groupResults.every(Boolean) : groupResults.some(Boolean);
}

const baseFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['text', 'textarea', 'wysiwyg', 'url', 'number', 'boolean', 'date', 'select', 'repeater', 'image']),
  required: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

function isValidUrlValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateFieldDefinitions(fields: unknown): FieldDefinition[] {
  const parsed = z.array(baseFieldSchema).parse(fields);
  for (const field of parsed) {
    if (field.type === 'repeater') {
      const nested = field.config?.fields;
      const contentTypeId = field.config?.contentTypeId;
      if (typeof contentTypeId === 'string' && contentTypeId) {
        continue;
      }
      if (!Array.isArray(nested)) throw new Error(`Repeater ${field.key} requires config.fields[] or config.contentTypeId`);
      validateFieldDefinitions(nested);
    }
    if (field.type === 'select') {
      const options = field.config?.options;
      if (!Array.isArray(options) || options.length === 0) throw new Error(`Select ${field.key} requires config.options[]`);
    }
  }
  return parsed;
}

function validateSingleValue(field: FieldDefinition, value: unknown, visibilityData: Record<string, unknown>) {
  const effectiveRequired = Boolean(field.required) && isFieldVisibleForEntryData(field, visibilityData);
  if ((value === undefined || value === null || value === '') && effectiveRequired) {
    throw new Error(`Field ${field.key} is required`);
  }
  if (value === undefined || value === null) return;

  switch (field.type) {
    case 'text':
    case 'textarea':
    case 'wysiwyg':
    case 'date':
      if (typeof value !== 'string') throw new Error(`Field ${field.key} must be string`);
      break;
    case 'url':
      if (typeof value !== 'string') throw new Error(`Field ${field.key} must be string`);
      if (!isValidUrlValue(value)) throw new Error(`Field ${field.key} must be an absolute URL or site-relative path`);
      break;
    case 'number':
      if (typeof value !== 'number') throw new Error(`Field ${field.key} must be number`);
      break;
    case 'boolean':
      if (typeof value !== 'boolean') throw new Error(`Field ${field.key} must be boolean`);
      break;
    case 'select': {
      if (typeof value !== 'string') throw new Error(`Field ${field.key} must be string`);
      const options = (field.config?.options as string[]) ?? [];
      if (options.length && !options.includes(value)) throw new Error(`Field ${field.key} must match configured option`);
      break;
    }
    case 'repeater': {
      if (!Array.isArray(value)) throw new Error(`Field ${field.key} must be an array`);
      const nestedFields = validateFieldDefinitions(field.config?.fields ?? []);
      for (const item of value) {
        if (typeof item !== 'object' || item === null || Array.isArray(item)) {
          throw new Error(`Repeater item in ${field.key} must be object`);
        }
        validateEntryData(nestedFields, item as Record<string, unknown>);
      }
      break;
    }

    case 'image': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(`Field ${field.key} must be image object`);
      }
      const assetId = (value as Record<string, unknown>).assetId;
      if (typeof assetId !== 'string' || !assetId) throw new Error(`Field ${field.key} requires assetId`);
      const variant = (value as Record<string, unknown>).variant;
      if (
        variant !== undefined &&
        !['original', 'web', 'thumbnail', 'small', 'medium', 'large', 'xlarge'].includes(String(variant))
      ) {
        throw new Error(`Field ${field.key} has invalid image variant`);
      }
      break;
    }
  }
}

export function validateEntryData(fields: FieldDefinition[], data: Record<string, unknown>) {
  for (const field of fields) validateSingleValue(field, data[field.key], data);
  return true;
}
