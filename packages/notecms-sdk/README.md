# @notecms/sdk

Headless TypeScript SDK for [NoteCMS](https://github.com/) GraphQL: **site API keys**, read-only content, optional **full-site snapshot** for static generation, and small **routing helpers**.

## Security

- **Never** put the API key in `VITE_`*, `NEXT_PUBLIC_*`, or any env var that is injected into the **browser** bundle. Keys are read credentials.
- Use **server-only** modules: SvelteKit `$env/static/private` / `+page.server.ts`, Next.js **server** Components / Route Handlers, Node scripts, CI.

## Developing (live CMS + fast refresh)

Use a **server** `load` (or equivalent) and a client configured so each request hits the API again:

```ts
import { NOTECMS_API_KEY, NOTECMS_GRAPHQL_URL, NOTECMS_SITE_ID } from '$env/static/private';
import { createDevNoteCmsClient } from '@notecms/sdk';

export const load = async () => {
  const cms = createDevNoteCmsClient({
    endpoint: NOTECMS_GRAPHQL_URL,
    apiKey: NOTECMS_API_KEY,
    siteId: NOTECMS_SITE_ID,
  });
  const page = await cms.entryBySlug('pages', 'home');
  return { page };
};
```

`createDevNoteCmsClient` sets `fetchInit: { cache: 'no-store' }` so **navigating or reloading** picks up CMS edits without a full static rebuild.

**Path helpers in dev:** `defaultPathForEntry` and `contentTypeHasSlug` need a `ContentType` (for `options.hasSlug`). Either:

- call `await cms.contentTypes()` once (e.g. in a layout `load`) and pass the matching type into `defaultPathForEntry`, or  
- use `fetchBuildSnapshot` in dev only for small sites (same as prod, more round-trips).

### SvelteKit

Prefer `**event.fetch`** in `load` if you want requests tied to the request lifecycle:

```ts
const cms = createDevNoteCmsClient({
  endpoint: NOTECMS_GRAPHQL_URL,
  apiKey: NOTECMS_API_KEY,
  siteId: NOTECMS_SITE_ID,
  fetch: event.fetch,
});
```

Use `depends('notecms:...')` + `invalidate()` when you want to refetch without a full navigation.

### Next.js (App Router)

Use **server** `fetch` with caching disabled, e.g. `fetch(url, { cache: 'no-store' })` — pass the same options via `fetchInit: { cache: 'no-store' }` on `createNoteCmsClient`. Do **not** apply Next’s `revalidate` options to this SDK’s `fetchInit`; they are Next-specific.

## Production (static / SSG)

```ts
import { createNoteCmsClient, fetchBuildSnapshot, listStaticPaths } from '@notecms/sdk';

const cms = createNoteCmsClient({
  endpoint: process.env.NOTECMS_GRAPHQL_URL!,
  apiKey: process.env.NOTECMS_API_KEY!,
  siteId: process.env.NOTECMS_SITE_ID!,
});

const snapshot = await fetchBuildSnapshot(cms, { includeAssets: true });
// snapshot.snapshotFormatVersion — bump handling when upgrading @notecms/sdk
const paths = listStaticPaths(snapshot);
```

### Snapshot semantics

- `**snapshotFormatVersion**`: increment in the SDK when the JSON shape changes; check it in your pipeline if you cache snapshots.
- **Ordering:** entries are **newest first** per content type (API `updatedAt` descending).
- **Consistency:** pagination runs sequentially per type; during **concurrent CMS writes** a snapshot is **best-effort** (rare edge cases: skip/duplicate across pages).

### Privacy

Entries include `**lastEditedBy.email`** as returned by the API. For public sites, consider whether that field should be stripped in your templates.

## Advanced

- `postGraphql`, raw query strings in `operations.ts`, and `client.query()` are available for custom selections.
- If the API ever returns **HTTP 200 with both `data` and `errors`**, the SDK **throws `NoteCmsError`** after GraphQL errors (partial `data` is not returned). Use `postGraphql` with a custom handler if you need partial success semantics.

## Limits

The SDK caps `entries` / `listAssets` `limit` at `**MAX_GRAPHQL_PAGE_SIZE**` (200) per request to reduce accidental overload. The NoteCMS API may still accept higher values from other clients.