import { resolveSiteId } from '../auth/api-key-scopes.js';
import { requireRole, type RequestContext } from '../auth/rbac.js';
import { UserModel } from '../db/models/User.js';
import {
  createPlatformBackup,
  deletePlatformBackup,
  listPlatformBackups,
  restorePlatformBackup,
} from '../backups/platform-backup-service.js';
import { getPlatformMaintenanceMode } from '../db/models/PlatformState.js';
import {
  createSiteBackup,
  deleteSiteBackup,
  getSiteBackupBundle,
  isSiteBackupEnabled,
  listSiteBackups,
  restoreSiteBackup,
  setSiteBackupEnabled,
} from '../site/site-backup-service.js';

async function requirePlatformAdmin(ctx: RequestContext): Promise<void> {
  if (!ctx.userId) throw new Error('Unauthorized');
  const user = await UserModel.findById(ctx.userId).select({ isAdmin: 1 }).lean();
  if (!user?.isAdmin) throw new Error('Platform administrator access required');
}

function toRestoreResult(summary: {
  contentTypesUpserted: number;
  entriesCreated: number;
  entriesUpdated: number;
  assetsImported: number;
  siteSettingsApplied: boolean;
}) {
  return summary;
}

export const backupQueryResolvers = {
  siteBackups: async (
    _: unknown,
    { siteId, limit, offset }: { siteId?: string | null; limit?: number | null; offset?: number | null },
    ctx: RequestContext,
  ) => {
    const sid = resolveSiteId(ctx, siteId);
    if (!ctx.userId) throw new Error('Unauthorized');
    await requireRole(ctx.userId, sid, 'owner');
    return listSiteBackups(sid, limit ?? 50, offset ?? 0);
  },

  platformBackups: async (
    _: unknown,
    { limit, offset }: { limit?: number | null; offset?: number | null },
    ctx: RequestContext,
  ) => {
    await requirePlatformAdmin(ctx);
    return listPlatformBackups(limit ?? 50, offset ?? 0);
  },

  platformMaintenanceMode: async (_: unknown, __: unknown, ctx: RequestContext) => {
    if (!ctx.userId) throw new Error('Unauthorized');
    return getPlatformMaintenanceMode();
  },

  exportSiteBackupJson: async (
    _: unknown,
    { siteId, backupId }: { siteId?: string | null; backupId: string },
    ctx: RequestContext,
  ) => {
    const sid = resolveSiteId(ctx, siteId);
    if (!ctx.userId) throw new Error('Unauthorized');
    await requireRole(ctx.userId, sid, 'owner');
    return getSiteBackupBundle(sid, backupId);
  },
};

export const backupMutationResolvers = {
  createSiteBackup: async (
    _: unknown,
    { siteId, label }: { siteId?: string | null; label?: string | null },
    ctx: RequestContext,
  ) => {
    const sid = resolveSiteId(ctx, siteId);
    if (!ctx.userId) throw new Error('Unauthorized');
    await requireRole(ctx.userId, sid, 'owner');
    return createSiteBackup(sid, { tier: 'manual', trigger: 'manual', userId: ctx.userId, label: label ?? undefined });
  },

  restoreSiteBackup: async (
    _: unknown,
    { siteId, backupId }: { siteId?: string | null; backupId: string },
    ctx: RequestContext,
  ) => {
    const sid = resolveSiteId(ctx, siteId);
    if (!ctx.userId) throw new Error('Unauthorized');
    await requireRole(ctx.userId, sid, 'owner');
    const result = await restoreSiteBackup(sid, backupId, ctx.userId);
    return {
      preRestoreBackupId: result.preRestoreBackupId,
      summary: toRestoreResult(result.summary),
    };
  },

  deleteSiteBackup: async (
    _: unknown,
    { siteId, backupId }: { siteId?: string | null; backupId: string },
    ctx: RequestContext,
  ) => {
    const sid = resolveSiteId(ctx, siteId);
    if (!ctx.userId) throw new Error('Unauthorized');
    await requireRole(ctx.userId, sid, 'owner');
    return deleteSiteBackup(backupId, sid);
  },

  updateSiteBackupSettings: async (
    _: unknown,
    { siteId, input }: { siteId?: string | null; input: { backupEnabled?: boolean | null } },
    ctx: RequestContext,
  ) => {
    const sid = resolveSiteId(ctx, siteId);
    if (!ctx.userId) throw new Error('Unauthorized');
    await requireRole(ctx.userId, sid, 'owner');
    if (input.backupEnabled != null) {
      await setSiteBackupEnabled(sid, Boolean(input.backupEnabled));
    }
    return { backupEnabled: await isSiteBackupEnabled(sid) };
  },

  createPlatformBackup: async (_: unknown, { label }: { label?: string | null }, ctx: RequestContext) => {
    await requirePlatformAdmin(ctx);
    return createPlatformBackup({
      tier: 'manual',
      trigger: 'manual',
      userId: ctx.userId!,
      label: label ?? undefined,
    });
  },

  restorePlatformBackup: async (
    _: unknown,
    { backupId, confirmId }: { backupId: string; confirmId: string },
    ctx: RequestContext,
  ) => {
    await requirePlatformAdmin(ctx);
    return restorePlatformBackup(backupId, confirmId);
  },

  deletePlatformBackup: async (_: unknown, { backupId }: { backupId: string }, ctx: RequestContext) => {
    await requirePlatformAdmin(ctx);
    return deletePlatformBackup(backupId);
  },
};
