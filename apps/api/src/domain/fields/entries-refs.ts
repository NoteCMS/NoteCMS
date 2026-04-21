import { ContentTypeModel } from '../../db/models/ContentType.js';
import { EntryModel } from '../../db/models/Entry.js';
import { hydrateRepeaterFields, type FieldDef } from './repeater-hydrate.js';

/** Validates manual `entries` fields: every stored id exists, belongs to the site, and matches the configured content type. */
export async function assertReferencedEntriesBelongToSite(
  siteId: string,
  fields: FieldDef[],
  data: Record<string, unknown>,
): Promise<void> {
  for (const field of fields) {
    const raw = data[field.key];

    if (field.type === 'entries') {
      const refCt = field.config?.contentTypeId;
      const mode = field.config?.mode === 'latest' ? 'latest' : 'manual';
      if (mode !== 'manual' || typeof refCt !== 'string' || !refCt.trim()) continue;
      if (!Array.isArray(raw)) continue;
      const ids = [...new Set(raw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0))];
      if (!ids.length) continue;
      const found = await EntryModel.find({ _id: { $in: ids }, siteId, contentTypeId: refCt }).select({ _id: 1 }).lean();
      const foundSet = new Set(found.map((e) => String(e._id)));
      const missing = ids.filter((id) => !foundSet.has(id));
      if (missing.length) {
        throw new Error(`Field "${field.key}": one or more selected entries are missing or not of the linked type`);
      }
    }

    if (field.type === 'repeater' && Array.isArray(raw)) {
      const nestedFields = (field.config?.fields ?? []) as FieldDef[];
      for (const item of raw) {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          await assertReferencedEntriesBelongToSite(siteId, nestedFields, item as Record<string, unknown>);
        }
      }
    }
  }
}

/**
 * Fills `entries` fields in `mode: "latest"` with id arrays (read model). Manual mode leaves stored arrays as-is.
 * When the linked type matches the parent entry's content type, the current entry id is excluded from each latest list.
 */
export async function resolveLatestEntriesInEntryData(
  siteId: string,
  parentContentTypeId: string,
  parentEntryId: string | undefined,
  fields: FieldDef[],
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { ...data };

  for (const field of fields) {
    if (field.type !== 'entries') continue;
    if ((field.config?.mode as string | undefined) !== 'latest') continue;
    const refCt = field.config?.contentTypeId;
    if (typeof refCt !== 'string' || !refCt.trim()) continue;
    const limit =
      typeof field.config?.limit === 'number' && Number.isFinite(field.config.limit)
        ? Math.min(50, Math.max(1, Math.floor(field.config.limit)))
        : 5;
    const sortBy = field.config?.sortBy === 'createdAt' ? 'createdAt' : 'updatedAt';
    const sortKey = sortBy === 'createdAt' ? 'createdAt' : 'updatedAt';

    const filter: Record<string, unknown> = { siteId, contentTypeId: refCt };
    if (parentEntryId && String(refCt) === String(parentContentTypeId)) {
      filter._id = { $ne: parentEntryId };
    }

    const docs = await EntryModel.find(filter)
      .sort({ [sortKey]: -1 })
      .limit(limit)
      .select({ _id: 1 })
      .lean();
    out[field.key] = docs.map((d) => String(d._id));
  }

  for (const field of fields) {
    if (field.type !== 'repeater') continue;
    const raw = out[field.key];
    if (!Array.isArray(raw)) continue;
    const nestedFields = (field.config?.fields ?? []) as FieldDef[];
    out[field.key] = await Promise.all(
      raw.map(async (item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
        return resolveLatestEntriesInEntryData(
          siteId,
          parentContentTypeId,
          parentEntryId,
          nestedFields,
          item as Record<string, unknown>,
        );
      }),
    );
  }

  return out;
}

/** Hydrates repeater-linked schemas and resolves latest-entry fields for API responses. */
export async function withResolvedLatestEntryFields(
  siteId: string,
  entryLean: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const ctId = String(entryLean.contentTypeId ?? '');
  const entryId = entryLean._id != null ? String(entryLean._id) : undefined;
  const ct = await ContentTypeModel.findOne({ _id: ctId, siteId }).lean();
  if (!ct?.fields) return entryLean;
  const hydrated = (await hydrateRepeaterFields(siteId, ct.fields as FieldDef[])) as FieldDef[];
  const baseData =
    entryLean.data && typeof entryLean.data === 'object' && !Array.isArray(entryLean.data)
      ? { ...(entryLean.data as Record<string, unknown>) }
      : {};
  const data = await resolveLatestEntriesInEntryData(siteId, ctId, entryId, hydrated, baseData);
  return { ...entryLean, data };
}
