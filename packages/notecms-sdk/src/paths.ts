/** Path helpers for static sites. @see `docs/ROUTING.md` in this package (permalink, homepage, SSG). */
import type { ContentType, Entry, Json } from './types.js';
import {
  buildCanonicalPath,
  buildRouteManifestNodes,
  type ContentTypeRoutingInput,
  type EntryRoutingInput,
  type RouteManifestEntry,
} from '@notecms/routing';

/** Whether the CMS content type is configured with URL slugs for entries (`options.hasSlug`). */
export function contentTypeHasSlug(ct: ContentType): boolean {
  const o = ct.options;
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  return Boolean((o as Record<string, Json>).hasSlug);
}

/**
 * Canonical URL path for a routable entry (respects `permalinkTemplate`, homepage, date tokens).
 * Returns `null` when the type does not use slugs or the entry has no slug.
 */
export function defaultPathForEntry(typeSlug: string, entry: Entry, contentType: ContentType): string | null {
  if (!contentTypeHasSlug(contentType)) return null;
  const slug = entry.slug;
  if (typeof slug !== 'string' || !slug.trim()) return null;
  const ctIn: ContentTypeRoutingInput = { slug: typeSlug, options: contentType.options as Record<string, unknown> };
  const entryIn: EntryRoutingInput = {
    id: entry.id,
    slug,
    publishedAt: entry.publishedAt ?? null,
    createdAt: (entry as Entry & { createdAt?: string }).createdAt ?? null,
  };
  return buildCanonicalPath({ contentType: ctIn, entry: entryIn });
}

export type StaticPathDescriptor = {
  path: string;
  typeSlug: string;
  /** Entry slug segment; empty string for archive routes. */
  slug: string;
  kind?: 'entry' | 'archive';
};

/**
 * Paths for SSG adapters (`getStaticPaths`, SvelteKit `entries`, etc.), including optional archive routes.
 * Uses the same path rules as `buildRouteManifestNodes` (throws on collisions).
 *
 * @see docs/ROUTING.md in this package for content-type options, homepage `/`, and examples.
 */
export function listStaticPaths(snapshot: {
  contentTypes: ContentType[];
  entriesByTypeSlug: Record<string, Entry[]>;
}): StaticPathDescriptor[] {
  const contentTypes = snapshot.contentTypes.map((c) => ({
    id: c.id,
    slug: c.slug,
    options: (c.options ?? null) as Record<string, unknown> | null,
  }));

  const entries: RouteManifestEntry[] = [];
  for (const ct of snapshot.contentTypes) {
    const list = snapshot.entriesByTypeSlug[ct.slug] ?? [];
    for (const e of list) {
      entries.push({
        id: e.id,
        contentTypeId: e.contentTypeId,
        lifecycleStatus: e.lifecycleStatus,
        deletedAt: e.deletedAt ?? null,
        scheduledPublishAt: e.scheduledPublishAt ?? null,
        slug: e.slug,
        publishedSlug: e.slug,
        publishedAt: e.publishedAt ?? null,
        createdAt: (e as Entry & { createdAt?: string }).createdAt ?? null,
      });
    }
  }

  const nodes = buildRouteManifestNodes(contentTypes, entries);
  return nodes.map((n) => ({
    path: n.path,
    typeSlug: n.contentTypeSlug,
    slug: n.kind === 'archive' ? '' : (n.entrySlug ?? ''),
    kind: n.kind,
  }));
}
