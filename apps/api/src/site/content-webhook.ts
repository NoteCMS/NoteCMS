import { createHmac, randomUUID } from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Optional outbound POST when entry content lifecycle changes (publish, unpublish, soft-delete, restore, rollback).
 * Set `CONTENT_WEBHOOK_URL` (and optionally `CONTENT_WEBHOOK_SECRET` for `X-NoteCMS-Signature` HMAC-SHA256 of the body).
 */
export function fireContentWebhook(event: string, payload: Record<string, unknown>): void {
  const url = env.contentWebhookUrl?.trim();
  if (!url) return;

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
  const secret = env.contentWebhookSecret?.trim();
  if (secret) {
    const sig = createHmac('sha256', secret).update(body).digest('hex');
    headers['X-NoteCMS-Signature'] = `sha256=${sig}`;
  }

  void fetch(url, { method: 'POST', headers, body }).catch(() => {
    /* best-effort; never throw into request path */
  });
}
