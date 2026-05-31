import { gqlRequest } from '@/api/graphql';

export type SiteBuildGql = {
  id: string;
  siteId: string;
  slug: string;
  label: string;
  sortOrder: number;
  enabled: boolean;
  triggerMinRole: 'editor' | 'owner';
  publishGithubOwner: string | null;
  publishGithubRepo: string | null;
  publishGithubRepoUrl: string | null;
  publishEventType: string | null;
  hasPublishPat: boolean;
  publishWebhookPostUrl: string | null;
  hasPublishReturnToken: boolean;
  publishLastTriggerAt: string | null;
  publishLastTriggerOk: boolean | null;
  publishLastTriggerMessage: string | null;
  publishLastReturnAt: string | null;
  publishLastReturnStatus: string | null;
  publishLastReturnRunUrl: string | null;
};

export const SITE_BUILD_GQL_FIELDS = `
  id siteId slug label sortOrder enabled triggerMinRole
  publishGithubOwner publishGithubRepo publishGithubRepoUrl publishEventType hasPublishPat
  publishWebhookPostUrl hasPublishReturnToken
  publishLastTriggerAt publishLastTriggerOk publishLastTriggerMessage
  publishLastReturnAt publishLastReturnStatus publishLastReturnRunUrl
`;

export function isBuildDispatchReady(build: SiteBuildGql): boolean {
  return Boolean(
    build.enabled && build.hasPublishPat && build.publishGithubRepoUrl?.trim() && build.publishEventType?.trim(),
  );
}

export function canTriggerBuild(
  build: SiteBuildGql,
  siteRole: string | undefined,
  isGlobalAdmin: boolean,
): boolean {
  if (!isBuildDispatchReady(build)) return false;
  if (isGlobalAdmin || siteRole === 'owner') return true;
  if (siteRole === 'editor' && build.triggerMinRole === 'editor') return true;
  return false;
}

export function buildTriggerBlockedReason(
  build: SiteBuildGql,
  siteRole: string | undefined,
  isGlobalAdmin: boolean,
): string | null {
  if (canTriggerBuild(build, siteRole, isGlobalAdmin)) return null;
  if (!build.enabled) return 'This build is turned off';
  if (!isBuildDispatchReady(build)) return 'Finish setup in site settings';
  if (build.triggerMinRole === 'owner' && siteRole === 'editor') return 'Owners only';
  return 'You cannot run this build';
}

function formatBuildOutcome(status: string | null | undefined): string | null {
  const st = status?.trim().toLowerCase();
  if (st === 'success') return 'Succeeded';
  if (st === 'failure') return 'Failed';
  if (st === 'cancelled') return 'Cancelled';
  return st ? st : null;
}

export function isBuildInProgress(build: SiteBuildGql): boolean {
  if (!build.publishLastTriggerAt || build.publishLastTriggerOk === false) return false;
  const triggerMs = new Date(build.publishLastTriggerAt).getTime();
  const returnMs = build.publishLastReturnAt ? new Date(build.publishLastReturnAt).getTime() : 0;
  return triggerMs > returnMs;
}

export function buildStatusLine(build: SiteBuildGql): string {
  const returnMs = build.publishLastReturnAt ? new Date(build.publishLastReturnAt).getTime() : 0;
  const triggerMs = build.publishLastTriggerAt ? new Date(build.publishLastTriggerAt).getTime() : 0;

  if (returnMs && returnMs >= triggerMs) {
    const when = new Date(build.publishLastReturnAt!).toLocaleString();
    const outcome = formatBuildOutcome(build.publishLastReturnStatus);
    return outcome ? `${outcome} ${when}` : `Finished ${when}`;
  }

  if (triggerMs) {
    const when = new Date(build.publishLastTriggerAt!).toLocaleString();
    if (build.publishLastTriggerOk === false) return `Started ${when} · something went wrong`;
    if (isBuildInProgress(build)) return `Running since ${when}`;
    return `Started ${when}`;
  }

  if (isBuildDispatchReady(build)) return 'Ready to run';
  return 'Needs setup';
}

export function buildsSummaryFromList(builds: SiteBuildGql[], loading: boolean): string {
  if (loading) return 'Loading…';
  if (builds.length === 0) return 'Not connected yet — add a build to get started.';
  const ready = builds.filter(isBuildDispatchReady).length;
  const suffix = ready === builds.length ? 'ready' : `${ready} of ${builds.length} ready`;
  const latest = [...builds]
    .filter((b) => b.publishLastReturnAt || b.publishLastTriggerAt)
    .sort((a, b) => {
      const ta = new Date(a.publishLastReturnAt ?? a.publishLastTriggerAt ?? 0).getTime();
      const tb = new Date(b.publishLastReturnAt ?? b.publishLastTriggerAt ?? 0).getTime();
      return ta - tb;
    })[0];
  const latestReturnMs = latest?.publishLastReturnAt ? new Date(latest.publishLastReturnAt).getTime() : 0;
  const latestTriggerMs = latest?.publishLastTriggerAt ? new Date(latest.publishLastTriggerAt).getTime() : 0;
  if (latest?.publishLastReturnAt && latestReturnMs >= latestTriggerMs) {
    return `${builds.length} build${builds.length === 1 ? '' : 's'} · last finished ${new Date(latest.publishLastReturnAt).toLocaleString()}`;
  }
  return `${builds.length} build${builds.length === 1 ? '' : 's'} · ${suffix}`;
}

export async function fetchSiteBuilds(token: string, siteId: string): Promise<SiteBuildGql[]> {
  const res = await gqlRequest<{ siteBuilds: SiteBuildGql[] }>(
    token,
    `query($siteId:ID!){ siteBuilds(siteId:$siteId){ ${SITE_BUILD_GQL_FIELDS} } }`,
    { siteId },
  );
  return res.siteBuilds;
}

export async function triggerSiteBuildRequest(
  token: string,
  siteId: string,
  buildId: string,
): Promise<{ ok: boolean; message: string }> {
  const res = await gqlRequest<{ triggerSiteBuild: { ok: boolean; message: string } }>(
    token,
    `mutation($siteId:ID!,$id:ID!){ triggerSiteBuild(siteId:$siteId,id:$id){ ok message } }`,
    { siteId, id: buildId },
  );
  return res.triggerSiteBuild;
}
