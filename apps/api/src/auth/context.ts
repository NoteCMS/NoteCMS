import { verifyApiKeyToken } from './api-key.js';
import type { RequestContext } from './types.js';
import { verifyToken } from './security.js';
import type { IncomingHttpHeaders } from 'node:http';

function rawAuthFromHeaders(headers: IncomingHttpHeaders): string {
  const authHeader = headers.authorization;
  const bearer =
    typeof authHeader === 'string' ? authHeader.replace(/^Bearer\s+/i, '').trim() : '';
  const headerKey = typeof headers['x-api-key'] === 'string' ? headers['x-api-key'].trim() : '';
  return bearer || headerKey;
}

/** Build GraphQL / MCP context from HTTP headers. */
export async function buildRequestContext(headers: IncomingHttpHeaders): Promise<RequestContext> {
  const raw = rawAuthFromHeaders(headers);
  if (!raw) return {};

  const jwtPayload = verifyToken(raw);
  if (jwtPayload?.userId) {
    return {
      userId: jwtPayload.userId,
      ...(jwtPayload.siteId ? { jwtSiteId: jwtPayload.siteId } : {}),
    };
  }

  const apiKeyCtx = await verifyApiKeyToken(raw);
  if (apiKeyCtx) {
    return {
      apiKey: {
        id: apiKeyCtx.id,
        siteId: apiKeyCtx.siteId,
        scopes: apiKeyCtx.scopes,
      },
      ...(apiKeyCtx.actingUserId ? { userId: apiKeyCtx.actingUserId } : {}),
    };
  }

  return {};
}
