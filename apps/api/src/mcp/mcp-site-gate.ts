import { SiteSettingsModel } from '../db/models/SiteSettings.js';
import type { RequestContext } from '../auth/types.js';

/**
 * When the request is tied to a single site (API key, or JWT issued with a site id), honor
 * `SiteSettings.mcpEnabled`. JWTs without `siteId` still allow MCP (e.g. cross-workspace admin).
 */
export async function assertMcpEndpointEnabledForContext(ctx: RequestContext): Promise<void> {
  const siteId = ctx.apiKey?.siteId ?? ctx.jwtSiteId;
  if (!siteId) return;

  const doc = await SiteSettingsModel.findOne({ siteId }).select({ mcpEnabled: 1 }).lean();
  if (doc && doc.mcpEnabled === false) {
    throw new Error('MCP is disabled for this workspace. An admin can enable it under API keys in the dashboard.');
  }
}
