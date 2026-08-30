import { createHmac, randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { SiteSettingsModel } from '../db/models/SiteSettings.js';

function postWebhook(
  url: string,
  secret: string | undefined,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const body = JSON.stringify({
    event,
    idempotencyKey: randomUUID(),
    at: new Date().toISOString(),
    ...payload,
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-NoteCMS-Event': event,
  };
  const trimmedSecret = secret?.trim();
  if (trimmedSecret) {
    const sig = createHmac('sha256', trimmedSecret).update(body).digest('hex');
    headers['X-NoteCMS-Signature'] = `sha256=${sig}`;
  }

  return fetch(url, { method: 'POST', headers, body }).then(() => undefined);
}

async function dispatchContentWebhooks(event: string, payload: Record<string, unknown>): Promise<void> {
  const siteId = typeof payload.siteId === 'string' ? payload.siteId : undefined;
  let enriched = { ...payload };

  if (siteId) {
    const settings = await SiteSettingsModel.findOne({ siteId })
      .select({ contentRevision: 1, liveWebhookUrl: 1, liveWebhookSecret: 1 })
      .lean();
    const contentRevision =
      typeof settings?.contentRevision === 'number' && Number.isFinite(settings.contentRevision)
        ? Math.floor(settings.contentRevision)
        : 0;
    enriched = { ...enriched, contentRevision };

    const siteUrl = typeof settings?.liveWebhookUrl === 'string' ? settings.liveWebhookUrl.trim() : '';
    if (siteUrl) {
      const siteSecret =
        typeof settings?.liveWebhookSecret === 'string' ? settings.liveWebhookSecret : undefined;
      await postWebhook(siteUrl, siteSecret, event, enriched).catch(() => undefined);
    }
  }

  const globalUrl = env.contentWebhookUrl?.trim();
  if (globalUrl) {
    await postWebhook(globalUrl, env.contentWebhookSecret, event, enriched).catch(() => undefined);
  }
}

/**
 * Optional outbound POST when entry content lifecycle changes (publish, unpublish, soft-delete, restore, rollback).
 * Fires the platform `CONTENT_WEBHOOK_URL` (if set) and the per-site `liveWebhookUrl` (if configured).
 */
export function fireContentWebhook(event: string, payload: Record<string, unknown>): void {
  void dispatchContentWebhooks(event, payload).catch(() => {
    /* best-effort; never throw into request path */
  });
}
