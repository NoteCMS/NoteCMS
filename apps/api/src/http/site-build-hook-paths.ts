/** Preferred public path — works when the edge proxy already forwards `/api/*` to the API. */
export const SITE_BUILD_HOOK_BASE = '/api/hooks/site-build';

/**
 * Legacy path kept for existing GitHub secrets that still POST here.
 * New URLs always use {@link SITE_BUILD_HOOK_BASE}; proxies only need `/api/*`.
 */
export const SITE_BUILD_HOOK_LEGACY_BASE = '/hooks/site-build';

export function buildSiteBuildHookPath(siteId: string, buildSlug?: string): string {
  const sid = encodeURIComponent(siteId);
  if (buildSlug) {
    return `${SITE_BUILD_HOOK_BASE}/${sid}/${encodeURIComponent(buildSlug)}`;
  }
  return `${SITE_BUILD_HOOK_BASE}/${sid}`;
}
