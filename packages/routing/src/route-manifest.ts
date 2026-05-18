import {
  buildArchivePath,
  buildCanonicalPath,
  contentTypeHasSlugFromOptions,
  type ContentTypeRoutingInput,
  type EntryRoutingInput,
} from './permalink.js';

export type RouteManifestNode = {
  path: string;
  kind: 'entry' | 'archive';
  contentTypeSlug: string;
  entryId?: string;
  /** Entry slug segment used in the path (for SSG adapters). Omitted for archives. */
  entrySlug?: string;
};

export type RouteManifestContentType = { id: string; slug: string; options?: Record<string, unknown> | null };

export type RouteManifestEntry = {
  id: string;
  contentTypeId: string;
  lifecycleStatus?: string;
  deletedAt?: string | null;
  scheduledPublishAt?: string | null;
  slug: string | null;
  publishedSlug: string | null;
  publishedAt?: string | null;
  createdAt?: string | null;
};

/** Published rows eligible for the static route manifest (not soft-deleted). */
function entryMatchesPublishedConsumerStatic(doc: RouteManifestEntry): boolean {
  if (doc.deletedAt != null && doc.deletedAt !== '') return false;
  return doc.lifecycleStatus === 'published';
}

function normalizePathKey(path: string): string {
  if (path === '/') return '/';
  return path.replace(/\/+$/, '') || '/';
}

/**
 * Build ordered route nodes for published consumer content. Throws if two nodes resolve to the same path.
 */
export function buildRouteManifestNodes(
  contentTypes: RouteManifestContentType[],
  entries: RouteManifestEntry[],
): RouteManifestNode[] {
  const sortedTypes = [...contentTypes].sort((a, b) => a.slug.localeCompare(b.slug));

  const nodes: RouteManifestNode[] = [];
  const seen = new Map<string, RouteManifestNode>();

  function add(node: RouteManifestNode) {
    const key = normalizePathKey(node.path);
    const prev = seen.get(key);
    if (prev) {
      throw new Error(
        `Route collision at "${key}": ${prev.kind} (${prev.contentTypeSlug}${prev.entryId ? ` id=${prev.entryId}` : ''}) vs ${node.kind} (${node.contentTypeSlug}${node.entryId ? ` id=${node.entryId}` : ''})`,
      );
    }
    seen.set(key, { ...node, path: key });
    nodes.push({ ...node, path: key });
  }

  for (const ct of sortedTypes) {
    const ctIn: ContentTypeRoutingInput = { slug: ct.slug, options: ct.options ?? null };
    if (!contentTypeHasSlugFromOptions(ct.options ?? null)) continue;

    const archive = buildArchivePath(ctIn);
    if (archive) {
      add({ path: archive, kind: 'archive', contentTypeSlug: ct.slug });
    }

    const typeEntries = entries
      .filter((e) => e.contentTypeId === ct.id && entryMatchesPublishedConsumerStatic(e))
      .sort((a, b) => a.id.localeCompare(b.id));

    for (const e of typeEntries) {
      const slug = typeof e.publishedSlug === 'string' && e.publishedSlug.trim() ? e.publishedSlug.trim() : null;
      if (!slug) continue;
      const entryIn: EntryRoutingInput = {
        id: e.id,
        slug,
        publishedAt: e.publishedAt ?? null,
        createdAt: e.createdAt ?? null,
      };
      const path = buildCanonicalPath({ contentType: ctIn, entry: entryIn });
      if (!path) continue;
      add({ path, kind: 'entry', contentTypeSlug: ct.slug, entryId: e.id, entrySlug: slug });
    }
  }

  return nodes;
}

