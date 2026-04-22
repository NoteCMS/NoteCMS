/** Fixed vocabulary for site API keys (never global). */
export const API_KEY_SCOPES = [
  'content_types:read',
  'content_types:write',
  'entries:read',
  'entries:write',
  'assets:read',
  'assets:write',
  'site_settings:read',
  'site_settings:write',
  'bundles:read',
  'bundles:write',
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

const SCOPE_SET = new Set<string>(API_KEY_SCOPES);

/** Pre-scoped-keys behavior: read content + settings only (no bundle export). */
export const LEGACY_API_KEY_SCOPES: readonly string[] = [
  'content_types:read',
  'entries:read',
  'assets:read',
  'site_settings:read',
];

export function apiKeyHasScope(scopes: readonly string[], scope: string): boolean {
  return scopes.includes(scope);
}

export function requireApiKeyScope(ctx: { apiKey?: { scopes: string[] } }, scope: ApiKeyScope | string): void {
  if (!ctx.apiKey) {
    throw new Error(`This operation requires an API key with scope: ${scope}`);
  }
  if (!apiKeyHasScope(ctx.apiKey.scopes, scope)) {
    throw new Error(`Access denied: API key lacks scope "${scope}"`);
  }
}

export function normalizeAndValidateScopes(input: unknown): string[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('At least one scope is required for new API keys');
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const s = typeof raw === 'string' ? raw.trim() : '';
    if (!s || !SCOPE_SET.has(s)) {
      throw new Error(`Invalid API key scope: ${String(raw)}`);
    }
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  if (!out.length) throw new Error('At least one valid scope is required');
  return out;
}

export function scopesRequireActingUser(scopes: readonly string[]): boolean {
  return scopes.some((s) => s.endsWith(':write'));
}

import type { RequestContext } from './types.js';

/** Resolve site id: API keys imply their site; JWT must pass siteId. */
export function resolveSiteId(ctx: RequestContext, siteId?: string | null): string {
  if (ctx.apiKey) {
    if (siteId != null && String(siteId).trim() !== '') {
      if (String(siteId) !== String(ctx.apiKey.siteId)) {
        throw new Error('siteId does not match this API key');
      }
    }
    return String(ctx.apiKey.siteId);
  }
  if (siteId == null || String(siteId).trim() === '') {
    throw new Error('siteId is required');
  }
  return String(siteId);
}
