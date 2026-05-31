import { env } from '../config/env.js';
import { SiteModel } from '../db/models/Site.js';
import { SiteSettingsModel } from '../db/models/SiteSettings.js';
import { decryptPublishPat } from '../auth/publish-webhook-crypto.js';

const GITHUB_OWNER_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;
const GITHUB_REPO_RE = /^[a-zA-Z0-9._-]{1,100}$/;
const EVENT_TYPE_RE = /^[a-zA-Z0-9_-]{1,100}$/;

export function assertPublishGithubIds(owner: string, repo: string, eventType: string) {
  const o = owner.trim();
  const r = repo.trim();
  const e = eventType.trim();
  if (!GITHUB_OWNER_RE.test(o)) throw new Error('Invalid GitHub owner.');
  if (!GITHUB_REPO_RE.test(r)) throw new Error('Invalid GitHub repository name.');
  if (!EVENT_TYPE_RE.test(e)) throw new Error('Invalid event type (use letters, numbers, underscores, hyphens).');
}

const OWNER_REPO_SHORT = /^([a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38})\/([a-zA-Z0-9._-]+)$/;

/**
 * Parse a GitHub.com repository URL or `owner/repo` shorthand into owner + repo name.
 * Accepts e.g. https://github.com/octocat/Hello-World, https://github.com/org/repo.git, org/repo
 */
export function parseGithubRepoUrl(raw: string): { owner: string; repo: string } {
  const t = raw.trim();
  if (!t) {
    throw new Error('Repository link is empty.');
  }

  const short = t.match(OWNER_REPO_SHORT);
  if (short) {
    const owner = short[1];
    let repo = short[2].replace(/\.git$/i, '');
    if (!GITHUB_OWNER_RE.test(owner) || !GITHUB_REPO_RE.test(repo)) {
      throw new Error('That owner or repository name is not valid on GitHub.');
    }
    return { owner, repo };
  }

  let url: URL;
  try {
    url = new URL(t.includes('://') ? t : `https://${t}`);
  } catch {
    throw new Error('Could not read that link. Try a full URL like https://github.com/your-org/your-repo');
  }

  const host = url.hostname.toLowerCase();
  if (host !== 'github.com' && host !== 'www.github.com') {
    throw new Error('Use a regular github.com repository link.');
  }

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 2) {
    throw new Error('The link should include the organization (or user) and the repository name.');
  }

  const owner = parts[0];
  let repo = parts[1].replace(/\.git$/i, '');

  if (!GITHUB_OWNER_RE.test(owner) || !GITHUB_REPO_RE.test(repo)) {
    throw new Error('That owner or repository name is not valid on GitHub.');
  }
  return { owner, repo };
}

export function buildPublishWebhookPostUrl(siteId: string): string {
  const base = env.publicApiBaseUrl;
  if (!base) {
    throw new Error('PUBLIC_API_BASE_URL is not set; cannot build callback URL for workflows.');
  }
  return `${base}/hooks/site-build/${encodeURIComponent(siteId)}`;
}

/**
 * Same POST endpoint as {@link buildPublishWebhookPostUrl}, with the plaintext return-webhook token in `?token=`.
 * GitHub Actions can use one secret containing this full URL (no separate Bearer header).
 */
export function buildPublishCompletionCallbackUrl(siteId: string, plainToken: string): string {
  const base = env.publicApiBaseUrl;
  if (!base) {
    throw new Error(
      'PUBLIC_API_BASE_URL must be set on the API so we can give you a completion callback URL. Ask whoever hosts this CMS.',
    );
  }
  const url = new URL(`${base}/hooks/site-build/${encodeURIComponent(siteId)}`);
  url.searchParams.set('token', plainToken);
  return url.toString();
}

type SiteSettingsLean = {
  enabled?: boolean | null;
  publishEnabled?: boolean | null;
  publishGithubOwner?: string | null;
  publishGithubRepo?: string | null;
  publishEventType?: string | null;
  publishGithubPatEnc?: string | null;
};

export async function triggerRepositoryDispatch(params: {
  siteId: string;
  triggeredByUserId: string;
  settings: SiteSettingsLean;
  buildSlug?: string;
  buildLabel?: string;
  onTriggerResult?: (result: { ok: boolean; statusCode: number; message: string }) => Promise<void>;
}): Promise<{ ok: boolean; statusCode: number; message: string }> {
  const { siteId, triggeredByUserId, settings, buildSlug, buildLabel, onTriggerResult } = params;

  const enabled =
    settings.enabled !== undefined && settings.enabled !== null
      ? Boolean(settings.enabled)
      : Boolean(settings.publishEnabled);
  if (!enabled) {
    return { ok: false, statusCode: 0, message: 'This build is turned off.' };
  }
  const owner = typeof settings.publishGithubOwner === 'string' ? settings.publishGithubOwner.trim() : '';
  const repo = typeof settings.publishGithubRepo === 'string' ? settings.publishGithubRepo.trim() : '';
  const eventType = typeof settings.publishEventType === 'string' ? settings.publishEventType.trim() : '';
  const enc = typeof settings.publishGithubPatEnc === 'string' ? settings.publishGithubPatEnc.trim() : '';
  if (!owner || !repo || !eventType || !enc) {
    return { ok: false, statusCode: 0, message: 'Publish webhook is not fully configured (GitHub details or token missing).' };
  }

  assertPublishGithubIds(owner, repo, eventType);

  let pat: string;
  try {
    pat = decryptPublishPat(enc);
  } catch {
    return { ok: false, statusCode: 0, message: 'Could not read stored GitHub token. Re-save your token in site settings.' };
  }
  if (!pat.trim()) {
    return { ok: false, statusCode: 0, message: 'GitHub token is missing. Re-save your token in site settings.' };
  }

  const site = await SiteModel.findById(siteId).select({ name: 1 }).lean();
  const siteName = site && typeof site.name === 'string' ? site.name : '';

  let postUrl = '';
  try {
    postUrl = buildSlug
      ? `${env.publicApiBaseUrl}/hooks/site-build/${encodeURIComponent(siteId)}/${encodeURIComponent(buildSlug)}`
      : buildPublishWebhookPostUrl(siteId);
  } catch {
    postUrl = '';
  }

  const clientPayload: Record<string, unknown> = {
    siteId,
    siteName,
    triggeredByUserId,
    triggeredAt: new Date().toISOString(),
  };
  if (buildSlug) {
    clientPayload.buildSlug = buildSlug;
  }
  if (buildLabel) {
    clientPayload.buildLabel = buildLabel;
  }
  if (postUrl) {
    clientPayload.buildCallbackPostUrl = postUrl;
  }

  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/dispatches`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${pat.trim()}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event_type: eventType,
        client_payload: clientPayload,
      }),
    });
    const statusCode = res.status;
    const persistTrigger = async (result: { ok: boolean; statusCode: number; message: string }) => {
      if (onTriggerResult) {
        await onTriggerResult(result);
        return;
      }
      await SiteSettingsModel.updateOne(
        { siteId },
        {
          $set: {
            publishLastTriggerAt: new Date(),
            publishLastTriggerOk: result.ok,
            publishLastTriggerStatusCode: result.statusCode,
            publishLastTriggerMessage: result.message.slice(0, 2000),
          },
        },
      );
    };

    if (statusCode === 204) {
      const result = { ok: true, statusCode, message: 'GitHub workflow was triggered.' };
      await persistTrigger(result);
      return result;
    }
    const text = await res.text().catch(() => '');
    const safe = text.length > 500 ? `${text.slice(0, 500)}…` : text;
    const message =
      statusCode === 401 || statusCode === 403
        ? 'GitHub rejected the token (check repo access and fine-grained permissions).'
        : statusCode === 404
          ? 'GitHub repository was not found (check owner and repo name).'
          : `GitHub returned HTTP ${String(statusCode)}${safe ? `: ${safe}` : ''}`;

    await persistTrigger({ ok: false, statusCode, message });
    return { ok: false, statusCode, message };
  } catch (e) {
    const msg = e instanceof Error && e.name === 'AbortError' ? 'Request to GitHub timed out.' : 'Could not reach GitHub.';
    const persistTrigger = async (result: { ok: boolean; statusCode: number; message: string }) => {
      if (onTriggerResult) {
        await onTriggerResult(result);
        return;
      }
      await SiteSettingsModel.updateOne(
        { siteId },
        {
          $set: {
            publishLastTriggerAt: new Date(),
            publishLastTriggerOk: result.ok,
            publishLastTriggerStatusCode: result.statusCode,
            publishLastTriggerMessage: result.message.slice(0, 2000),
          },
        },
      );
    };
    await persistTrigger({ ok: false, statusCode: 0, message: msg });
    return { ok: false, statusCode: 0, message: msg };
  } finally {
    clearTimeout(t);
  }
}
