import crypto from 'node:crypto';

function isEmptyScalar(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (typeof value === 'number') return false;
  if (typeof value === 'boolean') return false;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as object).length === 0;
  return false;
}

/** True when entry data is missing or has no meaningful content (including empty blocks). */
export function entryDataIsEmpty(data: unknown): boolean {
  if (data == null) return true;
  if (typeof data !== 'object' || Array.isArray(data)) return true;
  const obj = data as Record<string, unknown>;
  if (Object.keys(obj).length === 0) return true;
  if (Array.isArray(obj.blocks)) return obj.blocks.length === 0;
  return Object.values(obj).every(isEmptyScalar);
}

export function assertPublishPreservesContent(entry: Record<string, unknown>): void {
  if (entry.lifecycleStatus !== 'published') return;
  const publishedData = entry.publishedData;
  if (entryDataIsEmpty(publishedData)) return;
  if (entryDataIsEmpty(entry.data)) {
    throw new Error(
      'Refusing to publish: draft data is empty but the live version still has content. ' +
        'Fetch the entry again, merge your changes into data, then publish.',
    );
  }
}

/** Drop null/undefined top-level mutation keys; reject explicit data: null. */
export function sanitizeEntryUpdateInput(input: Record<string, unknown>): Record<string, unknown> {
  if (Object.prototype.hasOwnProperty.call(input, 'data') && input.data == null) {
    throw new Error(
      'Cannot set entry data to null. Omit the data field to leave content unchanged, or send the full merged data object.',
    );
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === null || value === undefined) continue;
    out[key] = value;
  }
  return out;
}

export function hashEntryData(data: unknown): string {
  const normalized = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  return crypto.createHash('sha256').update(JSON.stringify(normalized), 'utf8').digest('hex').slice(0, 16);
}

/** Returns blocks.length when data.blocks is an array; otherwise null. */
export function countEntryBlocks(data: unknown): number | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const blocks = (data as Record<string, unknown>).blocks;
  return Array.isArray(blocks) ? blocks.length : null;
}
