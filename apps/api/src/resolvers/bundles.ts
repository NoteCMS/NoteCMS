import { requireApiKeyScope, resolveSiteId } from '../auth/api-key-scopes.js';
import { requireRole, requireReadSite, type RequestContext } from '../auth/rbac.js';
import { bumpSiteContentRevision } from '../site/content-revision.js';
import { exportSiteBundleService, importSiteBundleService } from '../site/site-bundle-service.js';

export const bundleQueryResolvers = {
  exportSiteBundle: async (
    _: unknown,
    { siteId, options }: { siteId?: string | null; options: Record<string, unknown> },
    ctx: RequestContext,
  ) => {
    const sid = resolveSiteId(ctx, siteId);
    if (ctx.apiKey) {
      requireApiKeyScope(ctx, 'bundles:read');
      await requireReadSite(ctx, sid);
    } else {
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, sid, 'owner');
    }
    return await exportSiteBundleService(sid, {
      siteSettings: Boolean(options.siteSettings),
      contentTypes: Boolean(options.contentTypes),
      contentTypeSlugsForEntries: Array.isArray(options.contentTypeSlugsForEntries)
        ? (options.contentTypeSlugsForEntries as string[])
        : [],
      assets: Boolean(options.assets),
    });
  },
};

export const bundleMutationResolvers = {
  importSiteBundle: async (
    _: unknown,
    { siteId, bundle, options }: { siteId?: string | null; bundle: unknown; options: Record<string, unknown> },
    ctx: RequestContext,
  ) => {
    const sid = resolveSiteId(ctx, siteId);
    if (ctx.apiKey) requireApiKeyScope(ctx, 'bundles:write');
    if (!ctx.userId) throw new Error('Unauthorized');
    await requireRole(ctx.userId, sid, 'owner');
    const summary = await importSiteBundleService(sid, ctx.userId, bundle, {
      siteSettings: Boolean(options.siteSettings),
      contentTypes: Boolean(options.contentTypes),
      contentTypeSlugsForEntries: Array.isArray(options.contentTypeSlugsForEntries)
        ? (options.contentTypeSlugsForEntries as string[])
        : [],
      assets: Boolean(options.assets),
    });
    await bumpSiteContentRevision(sid);
    return summary;
  },
};
