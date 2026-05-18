import { slugify } from './slugify.js';

export type ContentTypeRoutingInput = {
  slug: string;
  options?: Record<string, unknown> | null;
};

export type EntryRoutingInput = {
  id: string;
  /** Slug segment already resolved for the reader (working or published snapshot). */
  slug: string | null;
  publishedAt?: string | null;
  createdAt?: string | null;
};

export function contentTypeHasSlugFromOptions(options?: Record<string, unknown> | null): boolean {
  const o = options;
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  return Boolean((o as Record<string, unknown>).hasSlug);
}

export function getDefaultPermalinkTemplate(): string {
  return '/:typeSlug/:slug';
}

export function effectivePermalinkTemplate(ct: ContentTypeRoutingInput): string | null {
  const hasSlug = contentTypeHasSlugFromOptions(ct.options ?? null);
  if (!hasSlug) return null;
  const raw = ct.options?.permalinkTemplate;
  if (typeof raw === 'string' && raw.trim()) return normalizeTemplateString(raw.trim());
  return getDefaultPermalinkTemplate();
}

function normalizeTemplateString(s: string): string {
  const t = s.trim();
  if (!t.startsWith('/')) return `/${t.replace(/^\/+/, '')}`;
  return t.replace(/\/+/g, '/');
}

export type HomepageOption = { enabled: boolean; entrySlug: string };

export function parseHomepageOption(options?: Record<string, unknown> | null): HomepageOption | null {
  const h = options?.homepage;
  if (!h || typeof h !== 'object' || Array.isArray(h)) return null;
  const rec = h as Record<string, unknown>;
  if (!rec.enabled) return null;
  const entrySlug = typeof rec.entrySlug === 'string' && rec.entrySlug.trim() ? slugify(rec.entrySlug) : 'home';
  return { enabled: true, entrySlug };
}

export function validatePermalinkTemplateString(template: string): void {
  if (!template.startsWith('/')) throw new Error('permalinkTemplate must start with /');
  const stripped = template.replace(/:(typeSlug|slug|id|year|month|day)\b/g, '');
  if (stripped.includes(':')) {
    throw new Error(`Unsupported permalink token in template: ${template}`);
  }
  if (!template.includes(':slug')) throw new Error('permalinkTemplate must include :slug when hasSlug is enabled');
}

/** Root-only templates have no `:typeSlug` token (e.g. `/:slug`). Used for homepage `/` mapping. */
export function isRootStylePermalinkTemplate(template: string): boolean {
  return !template.includes(':typeSlug');
}

/**
 * Normalize routing-related content type options (mutates a shallow copy).
 * @param contentTypeSlug URL key for the content type (Mongo `slug` field), used for default archive paths.
 */
export function normalizeContentTypeRoutingOptions(
  options: Record<string, unknown>,
  hasSlug: boolean,
  contentTypeSlug: string,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...options };
  if (!hasSlug) {
    delete next.permalinkTemplate;
    delete next.archiveEnabled;
    delete next.archivePath;
    delete next.homepage;
    return next;
  }

  const template =
    typeof next.permalinkTemplate === 'string' && String(next.permalinkTemplate).trim()
      ? normalizeTemplateString(String(next.permalinkTemplate).trim())
      : getDefaultPermalinkTemplate();

  validatePermalinkTemplateString(template);
  next.permalinkTemplate = template;

  const archiveEnabled = Boolean(next.archiveEnabled);
  if (archiveEnabled) {
    const ap = next.archivePath;
    if (typeof ap === 'string' && ap.trim()) {
      let p = normalizeTemplateString(ap.trim());
      if (p !== '/' && !p.startsWith('/')) throw new Error('archivePath must start with /');
      if (p !== '/') p = p.replace(/\/+$/, '');
      next.archivePath = p;
    } else {
      next.archivePath = `/${slugify(contentTypeSlug)}`;
    }
    next.archiveEnabled = true;
  } else {
    delete next.archivePath;
    delete next.archiveEnabled;
  }

  const home = next.homepage;
  if (home != null) {
    if (typeof home !== 'object' || Array.isArray(home)) throw new Error('homepage must be an object');
    const ho = home as Record<string, unknown>;
    if (ho.enabled === true) {
      if (!isRootStylePermalinkTemplate(template)) {
        throw new Error('homepage is only allowed when permalinkTemplate has no :typeSlug segment (e.g. /:slug)');
      }
      const es = typeof ho.entrySlug === 'string' && ho.entrySlug.trim() ? slugify(ho.entrySlug) : 'home';
      next.homepage = { enabled: true, entrySlug: es };
    } else {
      delete next.homepage;
    }
  }

  return next;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function dateParts(iso: string | null | undefined): { year: string; month: string; day: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return {
    year: String(d.getUTCFullYear()),
    month: pad2(d.getUTCMonth() + 1),
    day: pad2(d.getUTCDate()),
  };
}

/**
 * Canonical URL path (leading slash, no trailing slash except `/`).
 */
export function buildCanonicalPath(args: { contentType: ContentTypeRoutingInput; entry: EntryRoutingInput }): string | null {
  const template = effectivePermalinkTemplate(args.contentType);
  if (!template) return null;
  const slugSeg = typeof args.entry.slug === 'string' && args.entry.slug.trim() ? slugify(args.entry.slug) : null;
  if (!slugSeg) return null;

  const home = parseHomepageOption(args.contentType.options ?? null);
  if (home?.enabled && isRootStylePermalinkTemplate(template) && slugSeg === home.entrySlug) {
    return '/';
  }

  const publishedAt = args.entry.publishedAt ?? null;
  const createdAt = args.entry.createdAt ?? null;
  const parts = dateParts(publishedAt) ?? dateParts(createdAt);

  let out = template;
  out = out.replaceAll(':typeSlug', slugify(args.contentType.slug));
  out = out.replaceAll(':slug', slugSeg);
  out = out.replaceAll(':id', args.entry.id);
  if (parts) {
    out = out.replaceAll(':year', parts.year);
    out = out.replaceAll(':month', parts.month);
    out = out.replaceAll(':day', parts.day);
  } else {
    out = out.replaceAll(':year', '').replaceAll(':month', '').replaceAll(':day', '');
  }

  out = out.replace(/\/+/g, '/');
  if (out !== '/' && out.endsWith('/')) out = out.slice(0, -1);
  if (!out.startsWith('/')) out = `/${out}`;
  return out;
}

export function buildArchivePath(ct: ContentTypeRoutingInput): string | null {
  if (!contentTypeHasSlugFromOptions(ct.options ?? null)) return null;
  if (!Boolean(ct.options?.archiveEnabled)) return null;
  const ap = ct.options?.archivePath;
  if (typeof ap === 'string' && ap.trim()) {
    let p = normalizeTemplateString(ap.trim());
    if (p !== '/' && !p.startsWith('/')) return null;
    if (p !== '/') p = p.replace(/\/+$/, '');
    return p;
  }
  return `/${slugify(ct.slug)}`;
}

