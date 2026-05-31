import mongoose from 'mongoose';
import { encryptPublishPat } from '../auth/publish-webhook-crypto.js';
import { SiteBuildModel, SITE_BUILD_SLUG_PATTERN, type SiteBuildDoc, type SiteBuildTriggerRole } from '../db/models/SiteBuild.js';
import { SiteSettingsModel } from '../db/models/SiteSettings.js';
import {
  assertPublishGithubIds,
  buildPublishCompletionCallbackUrl,
  buildPublishWebhookPostUrl,
  parseGithubRepoUrl,
  triggerRepositoryDispatch,
} from './publish-webhook-service.js';
import { generateReturnWebhookToken, hashReturnWebhookToken } from './publish-webhook-token.js';
import { buildSiteBuildHookPath } from '../http/site-build-hook-paths.js';
import { env } from '../config/env.js';

export type SiteBuildLean = SiteBuildDoc;

export function assertSiteBuildSlug(slug: string): string {
  const s = slug.trim().toLowerCase();
  if (!SITE_BUILD_SLUG_PATTERN.test(s)) {
    throw new Error('Build id must start with a letter and use only lowercase letters, numbers, hyphens, and underscores.');
  }
  return s;
}

export function assertSiteBuildLabel(label: string): string {
  const s = label.trim();
  if (!s) throw new Error('Build name is required.');
  if (s.length > 80) throw new Error('Build name is too long (max 80 characters).');
  return s;
}

export function assertSiteBuildTriggerRole(role: string): SiteBuildTriggerRole {
  if (role === 'editor' || role === 'owner') return role;
  throw new Error('Who can run builds must be editor or owner.');
}

export function buildSiteBuildWebhookPostUrl(siteId: string, buildSlug: string): string {
  const base = env.publicApiBaseUrl;
  if (!base) {
    throw new Error('PUBLIC_API_BASE_URL is not set; cannot build callback URL for workflows.');
  }
  return `${base}${buildSiteBuildHookPath(siteId, buildSlug)}`;
}

export function buildSiteBuildCompletionCallbackUrl(siteId: string, buildSlug: string, plainToken: string): string {
  const base = env.publicApiBaseUrl;
  if (!base) {
    throw new Error(
      'PUBLIC_API_BASE_URL must be set on the API so we can give you a completion callback URL. Ask whoever hosts this CMS.',
    );
  }
  const url = new URL(`${base}${buildSiteBuildHookPath(siteId, buildSlug)}`);
  url.searchParams.set('token', plainToken);
  return url.toString();
}

type LegacyPublishFields = {
  publishEnabled?: boolean | null;
  publishGithubOwner?: string | null;
  publishGithubRepo?: string | null;
  publishEventType?: string | null;
  publishGithubPatEnc?: string | null;
  publishReturnTokenHash?: string | null;
  publishLastTriggerAt?: Date | null;
  publishLastTriggerOk?: boolean | null;
  publishLastTriggerStatusCode?: number | null;
  publishLastTriggerMessage?: string | null;
  publishLastReturnAt?: Date | null;
  publishLastReturnStatus?: string | null;
  publishLastReturnRunUrl?: string | null;
  publishLastReturnPayload?: unknown;
  lastPublishedWatermark?: unknown;
};

function legacyPublishConfigured(settings: LegacyPublishFields | null | undefined): boolean {
  if (!settings) return false;
  return Boolean(
    settings.publishEnabled ||
      settings.publishGithubOwner?.trim() ||
      settings.publishGithubRepo?.trim() ||
      settings.publishEventType?.trim() ||
      settings.publishGithubPatEnc?.trim() ||
      settings.publishReturnTokenHash?.trim() ||
      settings.publishLastTriggerAt ||
      settings.publishLastReturnAt,
  );
}

/** Copy legacy SiteSettings publish fields into a default `production` build when none exist yet. */
export async function ensureLegacySiteBuildMigrated(siteId: string): Promise<void> {
  const sid = new mongoose.Types.ObjectId(siteId);
  const existing = await SiteBuildModel.countDocuments({ siteId: sid });
  if (existing > 0) return;

  const settings = await SiteSettingsModel.findOne({ siteId: sid }).lean();
  if (!legacyPublishConfigured(settings)) return;

  await SiteBuildModel.create({
    siteId: sid,
    slug: 'production',
    label: 'Production',
    sortOrder: 0,
    enabled: Boolean(settings?.publishEnabled),
    triggerMinRole: 'editor',
    publishGithubOwner: settings?.publishGithubOwner ?? null,
    publishGithubRepo: settings?.publishGithubRepo ?? null,
    publishEventType: settings?.publishEventType ?? null,
    publishGithubPatEnc: settings?.publishGithubPatEnc ?? null,
    publishReturnTokenHash: settings?.publishReturnTokenHash ?? null,
    publishLastTriggerAt: settings?.publishLastTriggerAt ?? null,
    publishLastTriggerOk: settings?.publishLastTriggerOk ?? null,
    publishLastTriggerStatusCode: settings?.publishLastTriggerStatusCode ?? null,
    publishLastTriggerMessage: settings?.publishLastTriggerMessage ?? null,
    publishLastReturnAt: settings?.publishLastReturnAt ?? null,
    publishLastReturnStatus: settings?.publishLastReturnStatus ?? null,
    publishLastReturnRunUrl: settings?.publishLastReturnRunUrl ?? null,
    publishLastReturnPayload: settings?.publishLastReturnPayload ?? null,
    lastPublishedWatermark: settings?.lastPublishedWatermark ?? null,
  });
}

export async function listSiteBuilds(siteId: string): Promise<SiteBuildLean[]> {
  await ensureLegacySiteBuildMigrated(siteId);
  return SiteBuildModel.find({ siteId }).sort({ sortOrder: 1, slug: 1 }).lean();
}

export async function getSiteBuildById(siteId: string, buildId: string): Promise<SiteBuildLean | null> {
  await ensureLegacySiteBuildMigrated(siteId);
  if (!mongoose.Types.ObjectId.isValid(buildId)) return null;
  return SiteBuildModel.findOne({ _id: buildId, siteId }).lean();
}

export async function getSiteBuildBySlug(siteId: string, buildSlug: string): Promise<SiteBuildLean | null> {
  await ensureLegacySiteBuildMigrated(siteId);
  return SiteBuildModel.findOne({ siteId, slug: assertSiteBuildSlug(buildSlug) }).lean();
}

export function siteBuildDocToGql(doc: SiteBuildLean) {
  const patEnc = typeof doc.publishGithubPatEnc === 'string' ? doc.publishGithubPatEnc.trim() : '';
  const retHash = typeof doc.publishReturnTokenHash === 'string' ? doc.publishReturnTokenHash.trim() : '';
  const siteId = String(doc.siteId);
  const slug = doc.slug;

  let publishWebhookPostUrl: string | null = null;
  try {
    publishWebhookPostUrl = buildSiteBuildWebhookPostUrl(siteId, slug);
  } catch {
    publishWebhookPostUrl = null;
  }

  const owner = typeof doc.publishGithubOwner === 'string' ? doc.publishGithubOwner.trim() : '';
  const repo = typeof doc.publishGithubRepo === 'string' ? doc.publishGithubRepo.trim() : '';

  return {
    id: String(doc._id),
    siteId,
    slug,
    label: doc.label,
    sortOrder: typeof doc.sortOrder === 'number' ? doc.sortOrder : 0,
    enabled: Boolean(doc.enabled),
    triggerMinRole: doc.triggerMinRole === 'owner' ? 'owner' : 'editor',
    publishGithubOwner: owner || null,
    publishGithubRepo: repo || null,
    publishGithubRepoUrl: owner && repo ? `https://github.com/${owner}/${repo}` : null,
    publishEventType:
      typeof doc.publishEventType === 'string' && doc.publishEventType.trim() ? doc.publishEventType.trim() : null,
    hasPublishPat: Boolean(patEnc),
    publishWebhookPostUrl,
    hasPublishReturnToken: Boolean(retHash),
    publishLastTriggerAt: doc.publishLastTriggerAt ? new Date(doc.publishLastTriggerAt).toISOString() : null,
    publishLastTriggerOk: typeof doc.publishLastTriggerOk === 'boolean' ? doc.publishLastTriggerOk : null,
    publishLastTriggerStatusCode:
      typeof doc.publishLastTriggerStatusCode === 'number' ? doc.publishLastTriggerStatusCode : null,
    publishLastTriggerMessage:
      typeof doc.publishLastTriggerMessage === 'string' && doc.publishLastTriggerMessage.trim()
        ? doc.publishLastTriggerMessage.trim()
        : null,
    publishLastReturnAt: doc.publishLastReturnAt ? new Date(doc.publishLastReturnAt).toISOString() : null,
    publishLastReturnStatus:
      typeof doc.publishLastReturnStatus === 'string' && doc.publishLastReturnStatus.trim()
        ? doc.publishLastReturnStatus.trim()
        : null,
    publishLastReturnRunUrl:
      typeof doc.publishLastReturnRunUrl === 'string' && doc.publishLastReturnRunUrl.trim()
        ? doc.publishLastReturnRunUrl.trim()
        : null,
    publishLastReturnPayload:
      doc.publishLastReturnPayload && typeof doc.publishLastReturnPayload === 'object'
        ? doc.publishLastReturnPayload
        : null,
    lastPublishedWatermark:
      doc.lastPublishedWatermark != null && typeof doc.lastPublishedWatermark === 'object'
        ? doc.lastPublishedWatermark
        : null,
  };
}

export type SiteBuildInputFields = {
  slug?: string;
  label?: string;
  sortOrder?: number | null;
  enabled?: boolean | null;
  triggerMinRole?: string | null;
  githubRepoUrl?: string | null;
  publishGithubOwner?: string | null;
  publishGithubRepo?: string | null;
  publishEventType?: string | null;
  githubPat?: string | null;
};

function applyPublishInputToSet(
  input: SiteBuildInputFields,
  existing: SiteBuildLean | null,
  $set: Record<string, unknown>,
  $unset: Record<string, string>,
) {
  if (input.enabled !== undefined && input.enabled !== null) {
    $set.enabled = Boolean(input.enabled);
  }
  if (input.triggerMinRole !== undefined && input.triggerMinRole !== null) {
    $set.triggerMinRole = assertSiteBuildTriggerRole(String(input.triggerMinRole));
  }
  if (input.sortOrder !== undefined && input.sortOrder !== null) {
    $set.sortOrder = Number(input.sortOrder);
  }

  if (Object.prototype.hasOwnProperty.call(input, 'githubRepoUrl')) {
    const gru = input.githubRepoUrl;
    if (gru == null || (typeof gru === 'string' && gru.trim() === '')) {
      $set.publishGithubOwner = null;
      $set.publishGithubRepo = null;
    } else {
      const parsed = parseGithubRepoUrl(String(gru));
      $set.publishGithubOwner = parsed.owner;
      $set.publishGithubRepo = parsed.repo;
    }
  } else {
    if (input.publishGithubOwner !== undefined && input.publishGithubOwner !== null) {
      $set.publishGithubOwner = String(input.publishGithubOwner).trim() || null;
    }
    if (input.publishGithubRepo !== undefined && input.publishGithubRepo !== null) {
      $set.publishGithubRepo = String(input.publishGithubRepo).trim() || null;
    }
  }
  if (input.publishEventType !== undefined && input.publishEventType !== null) {
    $set.publishEventType = String(input.publishEventType).trim() || null;
  }

  if (Object.prototype.hasOwnProperty.call(input, 'githubPat')) {
    const raw = input.githubPat;
    if (raw === null || raw === undefined) {
      /* keep existing */
    } else if (String(raw).trim() === '') {
      $unset.publishGithubPatEnc = '';
    } else {
      try {
        $set.publishGithubPatEnc = encryptPublishPat(String(raw).trim());
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(
          msg.includes('JWT_SECRET') || msg.includes('PUBLISH_WEBHOOK_ENCRYPTION_KEY')
            ? 'Server encryption keys are not configured; set JWT_SECRET (or optionally PUBLISH_WEBHOOK_ENCRYPTION_KEY) on the API.'
            : msg,
        );
      }
    }
  }

  const nextEnabled = $set.enabled !== undefined ? Boolean($set.enabled) : Boolean(existing?.enabled ?? true);
  const nextOwner =
    $set.publishGithubOwner !== undefined
      ? ($set.publishGithubOwner as string | null)
      : typeof existing?.publishGithubOwner === 'string'
        ? existing.publishGithubOwner.trim()
        : '';
  const nextRepo =
    $set.publishGithubRepo !== undefined
      ? ($set.publishGithubRepo as string | null)
      : typeof existing?.publishGithubRepo === 'string'
        ? existing.publishGithubRepo.trim()
        : '';
  const nextEvent =
    $set.publishEventType !== undefined
      ? ($set.publishEventType as string | null)
      : typeof existing?.publishEventType === 'string'
        ? existing.publishEventType.trim()
        : '';
  let nextPatEnc =
    $set.publishGithubPatEnc !== undefined
      ? ($set.publishGithubPatEnc as string)
      : typeof existing?.publishGithubPatEnc === 'string'
        ? existing.publishGithubPatEnc.trim()
        : '';
  if ($unset.publishGithubPatEnc !== undefined) nextPatEnc = '';

  if (nextEnabled) {
    if (!nextOwner || !nextRepo || !nextEvent) {
      throw new Error(
        'When a build is enabled, add a repository link, workflow trigger name, and token—or turn the build off.',
      );
    }
    assertPublishGithubIds(nextOwner, nextRepo, nextEvent);
    if (!nextPatEnc) {
      throw new Error('When a build is enabled, a GitHub token is required (paste a new PAT or keep an existing one).');
    }
  }
}

export async function createSiteBuild(siteId: string, input: SiteBuildInputFields & { slug: string; label: string }) {
  await ensureLegacySiteBuildMigrated(siteId);
  const slug = assertSiteBuildSlug(input.slug);
  const label = assertSiteBuildLabel(input.label);
  const count = await SiteBuildModel.countDocuments({ siteId });
  if (count >= 20) throw new Error('At most 20 builds per workspace.');

  const $set: Record<string, unknown> = {
    siteId,
    slug,
    label,
    sortOrder: typeof input.sortOrder === 'number' ? input.sortOrder : count,
    enabled: input.enabled !== undefined && input.enabled !== null ? Boolean(input.enabled) : false,
    triggerMinRole:
      input.triggerMinRole != null ? assertSiteBuildTriggerRole(String(input.triggerMinRole)) : ('editor' as const),
  };
  const $unset: Record<string, string> = {};
  applyPublishInputToSet(input, null, $set, $unset);

  const doc: Record<string, unknown> = { ...$set };
  for (const key of Object.keys($unset)) {
    doc[key] = undefined;
  }

  try {
    const created = await SiteBuildModel.create(doc);
    return siteBuildDocToGql(created.toObject() as SiteBuildLean);
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code?: number }).code === 11000) {
      throw new Error('A build with that id already exists in this workspace.');
    }
    throw e;
  }
}

export async function updateSiteBuild(siteId: string, buildId: string, input: SiteBuildInputFields) {
  const existing = await getSiteBuildById(siteId, buildId);
  if (!existing) throw new Error('Build not found.');

  const $set: Record<string, unknown> = {};
  const $unset: Record<string, string> = {};

  if (input.slug !== undefined && input.slug !== null) {
    $set.slug = assertSiteBuildSlug(String(input.slug));
  }
  if (input.label !== undefined && input.label !== null) {
    $set.label = assertSiteBuildLabel(String(input.label));
  }

  applyPublishInputToSet(input, existing, $set, $unset);

  const update: Record<string, unknown> = {};
  if (Object.keys($set).length) update.$set = $set;
  if (Object.keys($unset).length) update.$unset = $unset;
  if (!Object.keys(update).length) return siteBuildDocToGql(existing);

  try {
    const updated = await SiteBuildModel.findOneAndUpdate({ _id: buildId, siteId }, update, { new: true }).lean();
    if (!updated) throw new Error('Build not found.');
    return siteBuildDocToGql(updated);
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code?: number }).code === 11000) {
      throw new Error('A build with that id already exists in this workspace.');
    }
    throw e;
  }
}

export async function deleteSiteBuild(siteId: string, buildId: string): Promise<boolean> {
  const res = await SiteBuildModel.deleteOne({ _id: buildId, siteId });
  return res.deletedCount === 1;
}

export async function triggerSiteBuild(params: {
  siteId: string;
  buildId: string;
  triggeredByUserId: string;
}): Promise<{ ok: boolean; statusCode: number; message: string }> {
  const build = await getSiteBuildById(params.siteId, params.buildId);
  if (!build) {
    return { ok: false, statusCode: 0, message: 'Build not found.' };
  }

  const result = await triggerRepositoryDispatch({
    siteId: params.siteId,
    triggeredByUserId: params.triggeredByUserId,
    settings: build,
    buildId: String(build._id),
    buildSlug: build.slug,
    buildLabel: build.label,
    onTriggerResult: async (triggerResult) => {
      await SiteBuildModel.updateOne(
        { _id: build._id },
        {
          $set: {
            publishLastTriggerAt: new Date(),
            publishLastTriggerOk: triggerResult.ok,
            publishLastTriggerStatusCode: triggerResult.statusCode,
            publishLastTriggerMessage: triggerResult.message.slice(0, 2000),
          },
        },
      );
    },
  });

  return result;
}

export async function rotateSiteBuildReturnWebhook(siteId: string, buildId: string) {
  const build = await getSiteBuildById(siteId, buildId);
  if (!build) throw new Error('Build not found.');
  const token = generateReturnWebhookToken();
  const hash = hashReturnWebhookToken(token);
  const callbackUrl = buildSiteBuildCompletionCallbackUrl(siteId, build.slug, token);
  await SiteBuildModel.updateOne({ _id: build._id }, { $set: { publishReturnTokenHash: hash } });
  return { callbackUrl };
}

export async function disableSiteBuildReturnWebhook(siteId: string, buildId: string) {
  const build = await getSiteBuildById(siteId, buildId);
  if (!build) throw new Error('Build not found.');
  await SiteBuildModel.updateOne(
    { _id: build._id },
    {
      $unset: {
        publishReturnTokenHash: '',
        publishLastReturnAt: '',
        publishLastReturnStatus: '',
        publishLastReturnRunUrl: '',
        publishLastReturnPayload: '',
      },
    },
  );
  const updated = await getSiteBuildById(siteId, buildId);
  if (!updated) throw new Error('Build not found.');
  return siteBuildDocToGql(updated);
}

/** Primary build for legacy SiteSettings publish field aggregation. */
export async function getPrimarySiteBuild(siteId: string) {
  const builds = await listSiteBuilds(siteId);
  return builds[0] ?? null;
}

/** Re-export legacy URL builders for backward-compatible callbacks without build slug. */
export { buildPublishWebhookPostUrl, buildPublishCompletionCallbackUrl };
