import { z } from 'zod';
import type { FieldDefinition } from './types.js';

const baseFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['text', 'textarea', 'number', 'boolean', 'date', 'select', 'repeater', 'image']),
  required: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

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

function validateSingleValue(field: FieldDefinition, value: unknown) {
  if ((value === undefined || value === null || value === '') && field.required) {
    throw new Error(`Field ${field.key} is required`);
  }
  if (value === undefined || value === null) return;

  switch (field.type) {
    case 'text':
    case 'textarea':
    case 'date':
      if (typeof value !== 'string') throw new Error(`Field ${field.key} must be string`);
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
      if (variant !== undefined && !['original', 'web', 'thumbnail'].includes(String(variant))) {
        throw new Error(`Field ${field.key} has invalid image variant`);
      }
      break;
    }
  }
}

export function validateEntryData(fields: FieldDefinition[], data: Record<string, unknown>) {
  for (const field of fields) validateSingleValue(field, data[field.key]);
  return true;
}
