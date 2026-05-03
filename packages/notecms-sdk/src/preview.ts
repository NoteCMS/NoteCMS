import { NoteCmsError } from './errors.js';
import type { SiteExportBundleV1 } from './types.js';

/**
 * Query keys appended when editors use **Open live site (preview)** on an entry with a public slug.
 * Your SSR layer should read these, call {@link fetchPreviewBundle}, then strip them from the URL.
 */
export const NOTECMS_PREVIEW_QUERY_ID = 'notecms_preview_id' as const;
export const NOTECMS_PREVIEW_QUERY_TOKEN = 'notecms_preview_token' as const;

/** Build a page URL with preview credentials (same convention as the CMS entry editor). */
export function buildUrlWithNoteCmsPreviewParams(pageUrl: string, publicId: string, secretToken: string): string {
  const u = new URL(pageUrl);
  u.searchParams.set(NOTECMS_PREVIEW_QUERY_ID, publicId);
  u.searchParams.set(NOTECMS_PREVIEW_QUERY_TOKEN, secretToken);
  return u.toString();
}

/** Parse preview credentials from a request URL’s query string (e.g. `request.url` in Next.js). */
export function parseNoteCmsPreviewQueryFromSearchParams(
  searchParams: URLSearchParams,
): { publicId: string; token: string } | null {
  const publicId = searchParams.get(NOTECMS_PREVIEW_QUERY_ID)?.trim() ?? '';
  const token = searchParams.get(NOTECMS_PREVIEW_QUERY_TOKEN)?.trim() ?? '';
  if (!publicId || !token) return null;
  return { publicId, token };
}

export type FetchPreviewSiteBundleOptions = {
  /** Bearer secret returned once from `createPreviewBundle` (editor mutation). */
  token: string;
  signal?: AbortSignal;
};

/**
 * Fetch a frozen site export bundle (same shape as GraphQL `exportSiteBundle` / CMS JSON export).
 * Use **server-side or CI only**: the preview token is a secret with broad read access to workspace content.
 */
export async function fetchPreviewSiteBundle(
  apiBaseUrl: string,
  publicId: string,
  options: FetchPreviewSiteBundleOptions,
): Promise<{ bundle: SiteExportBundleV1; contentSha256: string | null }> {
  const base = apiBaseUrl.replace(/\/$/, '');
  const url = `${base}/api/preview/${encodeURIComponent(publicId)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${options.token}` },
    signal: options.signal,
    cache: 'no-store',
  });
  const contentSha256 = res.headers.get('x-content-sha256');
  if (res.status === 401) {
    throw new NoteCmsError('Preview bundle: missing or invalid Bearer token', { status: 401 });
  }
  if (res.status === 404) {
    throw new NoteCmsError('Preview bundle not found, revoked, or expired', { status: 404 });
  }
  if (!res.ok) {
    throw new NoteCmsError(`Preview bundle request failed (${res.status})`, { status: res.status });
  }
  const bundle = (await res.json()) as SiteExportBundleV1;
  return { bundle, contentSha256 };
}

/** @alias {@link fetchPreviewSiteBundle} */
export const fetchPreviewBundle = fetchPreviewSiteBundle;
