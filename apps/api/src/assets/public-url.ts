/** Build a public HTTPS URL for a storage object key (path segments preserved, encoded per segment). */
export function buildPublicAssetUrl(baseUrl: string, storageKey: string): string {
  const base = baseUrl.replace(/\/$/, '');
  const segments = storageKey.split('/').map((segment) => encodeURIComponent(segment));
  return `${base}/${segments.join('/')}`;
}

/** True when GraphQL should return CDN/public URLs instead of inline data URLs. */
export function usePublicAssetUrls(cdnBaseUrl: string | undefined): boolean {
  return Boolean(cdnBaseUrl?.trim());
}
