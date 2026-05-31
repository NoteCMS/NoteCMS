import type { RequestContext } from '../auth/types.js';
import { apiKeyHasScope } from '../auth/api-key-scopes.js';
import { entryReadUsesPublishedSnapshot } from './entry-lifecycle.js';

export const PAGES_CONTENT_TYPE_SLUG = 'pages';

export const META_TITLE_MAX_LENGTH = 70;
export const META_DESCRIPTION_MAX_LENGTH = 500;

export type EntryMetaFields = {
  title: string;
  description: string;
};

export type EntryMetaInput = {
  title?: string | null;
  description?: string | null;
};

function readMetaTaxonomyEnabled(options: unknown): boolean {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return false;
  const mt = (options as Record<string, unknown>).metaTaxonomy;
  if (!mt || typeof mt !== 'object' || Array.isArray(mt)) return false;
  return (mt as Record<string, unknown>).enabled === true;
}

export function isMetaTaxonomyEnabled(contentType: { slug: string; options?: unknown }): boolean {
  if (contentType.slug === PAGES_CONTENT_TYPE_SLUG) return true;
  return readMetaTaxonomyEnabled(contentType.options);
}

/** Normalize content-type options; pages always have meta taxonomy enabled. */
export function normalizeMetaTaxonomyOptions(
  contentTypeSlug: string,
  options: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...options };
  if (contentTypeSlug === PAGES_CONTENT_TYPE_SLUG) {
    const mt = next.metaTaxonomy;
    if (
      mt &&
      typeof mt === 'object' &&
      !Array.isArray(mt) &&
      (mt as Record<string, unknown>).enabled === false
    ) {
      throw new Error('Meta taxonomy cannot be disabled for the pages content type');
    }
    next.metaTaxonomy = { enabled: true };
    return next;
  }
  const enabled = readMetaTaxonomyEnabled(next);
  if (enabled) {
    next.metaTaxonomy = { enabled: true };
  } else {
    delete next.metaTaxonomy;
  }
  return next;
}

function trimField(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  const t = value.trim();
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen);
}

export function emptyEntryMeta(): EntryMetaFields {
  return { title: '', description: '' };
}

export function normalizeEntryMetaInput(
  raw: unknown,
  opts: { enabled: boolean },
): EntryMetaFields {
  if (!opts.enabled) {
    if (raw !== undefined && raw !== null) {
      throw new Error('Meta fields are not enabled for this content type');
    }
    return emptyEntryMeta();
  }
  if (raw === undefined || raw === null) return emptyEntryMeta();
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid meta input');
  }
  const o = raw as EntryMetaInput;
  return {
    title: trimField(o.title, META_TITLE_MAX_LENGTH),
    description: trimField(o.description, META_DESCRIPTION_MAX_LENGTH),
  };
}

function metaFromDoc(doc: Record<string, unknown>, usePublished: boolean): EntryMetaFields {
  const source = usePublished ? doc.publishedMeta : doc.meta;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return emptyEntryMeta();
  }
  const m = source as Record<string, unknown>;
  return {
    title: typeof m.title === 'string' ? m.title : '',
    description: typeof m.description === 'string' ? m.description : '',
  };
}

export function resolveEntryMetaForReader(doc: Record<string, unknown>, ctx: RequestContext): EntryMetaFields {
  if (entryReadUsesPublishedSnapshot(ctx)) {
    const st = doc.lifecycleStatus as string | undefined;
    if (st !== 'published') return emptyEntryMeta();
    return metaFromDoc(doc, true);
  }
  return metaFromDoc(doc, false);
}

export function entryMetaDiffersFromPublished(doc: Record<string, unknown>): boolean {
  const draft = metaFromDoc(doc, false);
  const published = metaFromDoc(doc, true);
  return draft.title !== published.title || draft.description !== published.description;
}

export function metaPayloadFromDoc(doc: Record<string, unknown>): EntryMetaFields {
  return metaFromDoc(doc, false);
}

export function publishedMetaPayloadFromDoc(doc: Record<string, unknown>): EntryMetaFields {
  return metaFromDoc(doc, true);
}

/** For revision payloads and publish snapshots. */
export function metaToStored(meta: EntryMetaFields): EntryMetaFields {
  return {
    title: trimField(meta.title, META_TITLE_MAX_LENGTH),
    description: trimField(meta.description, META_DESCRIPTION_MAX_LENGTH),
  };
}

export function assertMetaNotDisabledForMutation(
  contentType: { slug: string; options?: unknown },
  metaArg: unknown,
): void {
  if (isMetaTaxonomyEnabled(contentType)) return;
  if (metaArg !== undefined && metaArg !== null) {
    throw new Error('Meta fields are not enabled for this content type');
  }
}
