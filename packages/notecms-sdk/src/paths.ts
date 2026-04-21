import type { ContentType, Entry, Json } from './types.js';

/** Whether the CMS content type is configured with URL slugs for entries (`options.hasSlug`). */
export function contentTypeHasSlug(ct: ContentType): boolean {
  const o = ct.options;
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  return Boolean((o as Record<string, Json>).hasSlug);
}

/**
 * Default URL path for a routable entry: `/${typeSlug}/${entrySlug}`.
 * Returns `null` when the type does not use slugs or the entry has no slug.
 *
 * **Out of scope:** base path (`/blog`), i18n prefixes, trailing-slash policy — compose those in your app.
 */
export function defaultPathForEntry(typeSlug: string, entry: Entry, contentType: ContentType): string | null {
  if (!contentTypeHasSlug(contentType)) return null;
  const slug = entry.slug;
  if (typeof slug !== 'string' || !slug.trim()) return null;
  return `/${typeSlug}/${slug}`;
}

export type StaticPathDescriptor = {
  path: string;
  typeSlug: string;
  slug: string;
};

/**
 * Paths for SSG adapters (`getStaticPaths`, SvelteKit `entries`, etc.), only for content types with `hasSlug`
 * and entries that have a non-empty `slug`.
 *
 * If the database ever contained duplicate slugs for one type, the API enforces a partial unique index; the
 * snapshot builder keeps the last seen entry per slug when assembling `BuildSnapshot.slugIndex`.
 */
export function listStaticPaths(snapshot: {
  contentTypes: ContentType[];
  slugIndex: Record<string, Record<string, Entry>>;
}): StaticPathDescriptor[] {
  const paths: StaticPathDescriptor[] = [];
  for (const ct of snapshot.contentTypes) {
    if (!contentTypeHasSlug(ct)) continue;
    const bySlug = snapshot.slugIndex[ct.slug];
    if (!bySlug) continue;
    for (const slug of Object.keys(bySlug)) {
      const entry = bySlug[slug];
      if (!entry) continue;
      const path = defaultPathForEntry(ct.slug, entry, ct);
      if (path) paths.push({ path, typeSlug: ct.slug, slug });
    }
  }
  return paths;
}
