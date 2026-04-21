import { ContentTypeModel } from '../../db/models/ContentType.js';

export type FieldDef = {
  key: string;
  type: string;
  config?: {
    fields?: FieldDef[];
    contentTypeId?: string;
    mode?: string;
    limit?: number;
    maxItems?: number;
    sortBy?: string;
  };
};

export function collectRepeaterContentTypeIds(fields: FieldDef[]): string[] {
  const ids: string[] = [];
  for (const field of fields) {
    if (field.type === 'repeater') {
      const refId = field.config?.contentTypeId;
      if (typeof refId === 'string' && refId) ids.push(refId);
      const nested = (field.config?.fields ?? []) as FieldDef[];
      ids.push(...collectRepeaterContentTypeIds(nested));
    }
  }
  return ids;
}

/** Content types linked by `entries` fields (any depth under repeaters). */
export function collectEntriesFieldContentTypeIds(fields: FieldDef[]): string[] {
  const ids: string[] = [];
  for (const field of fields) {
    if (field.type === 'entries') {
      const refId = field.config?.contentTypeId;
      if (typeof refId === 'string' && refId) ids.push(refId);
    }
    if (field.type === 'repeater') {
      ids.push(...collectEntriesFieldContentTypeIds((field.config?.fields ?? []) as FieldDef[]));
    }
  }
  return ids;
}

export async function assertReferencedContentTypesExist(
  siteId: string,
  fields: FieldDef[],
  currentContentTypeId?: string,
) {
  const repeaterRefs = [...new Set(collectRepeaterContentTypeIds(fields))];
  const entriesRefs = [...new Set(collectEntriesFieldContentTypeIds(fields))];
  const referencedIds = [...new Set([...repeaterRefs, ...entriesRefs])];
  if (!referencedIds.length) return;
  if (currentContentTypeId && repeaterRefs.includes(currentContentTypeId)) {
    throw new Error('Repeater cannot reference itself');
  }

  const existing = await ContentTypeModel.find({ _id: { $in: referencedIds }, siteId }).select({ _id: 1 }).lean();
  const existingIds = new Set(existing.map((item) => String(item._id)));
  const missing = referencedIds.filter((id) => !existingIds.has(String(id)));
  if (missing.length) throw new Error('One or more referenced content types do not exist in this site');
}

export async function hydrateRepeaterFields(
  siteId: string,
  fields: FieldDef[],
  visited = new Set<string>(),
): Promise<FieldDef[]> {
  const hydrated: FieldDef[] = [];
  for (const field of fields) {
    if (field.type !== 'repeater') {
      hydrated.push(field);
      continue;
    }

    const contentTypeId = field.config?.contentTypeId;
    if (typeof contentTypeId === 'string' && contentTypeId) {
      if (visited.has(contentTypeId)) throw new Error('Circular repeater content type reference detected');
      const referenced = await ContentTypeModel.findOne({ _id: contentTypeId, siteId }).lean();
      if (!referenced) throw new Error('Referenced repeater content type not found');
      visited.add(contentTypeId);
      const nested = await hydrateRepeaterFields(siteId, referenced.fields as FieldDef[], visited);
      visited.delete(contentTypeId);
      hydrated.push({
        ...field,
        config: {
          ...(field.config ?? {}),
          fields: nested,
        },
      });
      continue;
    }

    const nested = await hydrateRepeaterFields(siteId, (field.config?.fields ?? []) as FieldDef[], visited);
    hydrated.push({
      ...field,
      config: {
        ...(field.config ?? {}),
        fields: nested,
      },
    });
  }
  return hydrated;
}
