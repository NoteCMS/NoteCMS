# Live sites (SSR / ISR)

NoteCMS is headless: your frontend (Next.js, SvelteKit, etc.) fetches content at request time. Images load from CDN URLs returned by GraphQL — not embedded in API responses.

## Client

| Client | When |
|--------|------|
| `createLiveNoteCmsClient` | Production SSR / ISR |
| `createDevNoteCmsClient` | Local dev (`cache: 'no-store'`) |
| `createNoteCmsClient` | Static builds / CI |

```ts
import { createLiveNoteCmsClient } from '@notecms/sdk';

const cms = createLiveNoteCmsClient({
  endpoint: process.env.NOTECMS_GRAPHQL_URL!,
  apiKey: process.env.NOTECMS_API_KEY!,
});

const page = await cms.entryBySlug('pages', 'home');
const settings = await cms.siteSettings();
```

**Security:** keep the API key server-only. Never use `NEXT_PUBLIC_*` or `VITE_*` for credentials.

## Cache invalidation

`siteSettings.contentRevision` increments when entries, types, settings, or assets change. Use it as a cache tag or compare on each request.

Configure a **live webhook URL** in NoteCMS site settings (owners only). On publish/unpublish/delete/restore/rollback, NoteCMS POSTs:

```json
{
  "event": "entry.published",
  "siteId": "...",
  "entryId": "...",
  "contentRevision": 42,
  "idempotencyKey": "...",
  "at": "2026-01-01T12:00:00.000Z"
}
```

When `liveWebhookSecret` is set, verify `X-NoteCMS-Signature: sha256=<hex>` (HMAC-SHA256 of the raw body).

### Next.js App Router example

```ts
// app/api/notecms/revalidate/route.ts
import { revalidateTag } from 'next/cache';
import { createHmac, timingSafeEqual } from 'node:crypto';

export async function POST(request: Request) {
  const secret = process.env.NOTECMS_WEBHOOK_SECRET;
  const body = await request.text();

  if (secret) {
    const header = request.headers.get('x-notecms-signature') ?? '';
    const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    const a = Buffer.from(header);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return Response.json({ ok: false }, { status: 401 });
    }
  }

  const payload = JSON.parse(body) as { siteId?: string };
  if (payload.siteId) revalidateTag(`notecms:${payload.siteId}`);
  return Response.json({ ok: true });
}
```

In your page:

```ts
export const revalidate = 60; // stale-while-revalidate fallback

export default async function Page() {
  const cms = createLiveNoteCmsClient({ /* ... */ });
  const page = await cms.entryBySlug('pages', 'home');
  // ...
}
```

Tag fetches with `next: { tags: ['notecms:YOUR_SITE_ID'] }` when using `fetch` directly; the SDK uses `fetchInit` for the same.

## Uptime

- **Cached pages** can keep serving when the CMS is briefly unavailable.
- **CDN assets** are independent of CMS uptime.
- On CMS fetch failure, prefer serving the last good cached HTML over a 500.

## Static vs live

| | Static (SSG) | Live (SSR/ISR) |
|---|--------------|----------------|
| Content freshness | After manual/CI build | Seconds (webhook + revalidate) |
| CMS downtime impact | None on published site | Stale cache may still work |
| GraphQL per page view | None (build time only) | Small JSON queries |
| Images | CDN URLs in snapshot | CDN URLs in GraphQL |

Static builds via GitHub Actions remain fully supported — live mode is an additional option.
