# @notecms/sdk

Headless TypeScript SDK for [NoteCMS](https://github.com/NoteCMS/NoteCMS) GraphQL: site API keys, read-only content, optional full-site snapshot for static generation, and permalink routing helpers.

**Routing (pages, homepage, SSG paths):** see **[docs/ROUTING.md](./docs/ROUTING.md)** — canonical guide for humans and agents. Agent index: **[AGENTS.md](./AGENTS.md)**.

## Security

- **Never** put the API key in `VITE_*`, `NEXT_PUBLIC_*`, or any env var that is injected into the browser bundle. Keys are read credentials.
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
    // siteId is optional with a site API key — resolved via `apiKeyInfo` on first request
    ...(NOTECMS_SITE_ID ? { siteId: NOTECMS_SITE_ID } : {}),
  });
  const page = await cms.entryBySlug('pages', 'home');
  return { page };
};
```

`createDevNoteCmsClient` sets `fetchInit: { cache: 'no-store' }` so **navigating or reloading** picks up CMS edits without a full static rebuild.

**Live production sites (SSR / ISR):** see **[docs/LIVE_SITES.md](./docs/LIVE_SITES.md)** — `createLiveNoteCmsClient`, cache invalidation webhooks, and CDN asset URLs.

Use `await cms.ensureSiteId()` if you need the workspace id before any other call. The synchronous `cms.siteId` getter works after the id has been resolved.

**Path helpers in dev:** `defaultPathForEntry` and `contentTypeHasSlug` need a `ContentType` (for `options.hasSlug`). Either:

- call `await cms.contentTypes()` once (e.g. in a layout `load`) and pass the matching type into `defaultPathForEntry`, or  
- use `fetchBuildSnapshot` in dev only for small sites (same as prod, more round-trips).

### SvelteKit

Prefer `event.fetch` in `load` if you want requests tied to the request lifecycle:

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

## Content type routing (permalink)

URL rules are configured per content type in `options` (`hasSlug`, `permalinkTemplate`, `archive*`, `homepage`). The SDK computes paths from that config — do not hard-code URL shapes in your site.

**Full reference (examples, API table, SSG workflow): [docs/ROUTING.md](./docs/ROUTING.md)**

Quick production pattern:

```ts
const snapshot = await fetchBuildSnapshot(cms);
const paths = listStaticPaths(snapshot); // { path, typeSlug, slug, kind }[]
```

## Production (static / SSG)

```ts
import { createNoteCmsClient, fetchBuildSnapshot, listStaticPaths } from '@notecms/sdk';

const cms = createNoteCmsClient({
  endpoint: process.env.NOTECMS_GRAPHQL_URL!,
  apiKey: process.env.NOTECMS_API_KEY!,
  siteId: process.env.NOTECMS_SITE_ID, // optional when the key is site-scoped
});

const snapshot = await fetchBuildSnapshot(cms, { includeAssets: true });
// snapshot.snapshotFormatVersion — bump handling when upgrading @notecms/sdk
const paths = listStaticPaths(snapshot); // throws if archive + entry paths collide
```

### Snapshot semantics

- `snapshotFormatVersion`: increment in the SDK when the JSON shape changes; check it in your pipeline if you cache snapshots.
- **Ordering:** entries are **newest first** per content type (API `updatedAt` descending).
- **Consistency:** pagination runs sequentially per type; during **concurrent CMS writes** a snapshot is **best-effort** (rare edge cases: skip/duplicate across pages).

### Privacy

Entries include `lastEditedBy.email` as returned by the API. For public sites, consider whether that field should be stripped in your templates.

## SEO metadata (`entry.meta`)

When a content type has meta taxonomy enabled (`options.metaTaxonomy.enabled`, or always for slug `pages`), entries expose **`meta.title`** and **`meta.description`** as top-level fields (not inside `data`). Published sites should read the **published snapshot** (default for read-only API keys without `entries:draft:read`).

```ts
const page = await cms.entryBySlug('pages', 'about');

// Next.js App Router — generateMetadata
export async function generateMetadata() {
  const entry = await cms.entryBySlug('pages', 'about');
  const title = entry.meta?.title?.trim() || entry.name;
  const description = entry.meta?.description?.trim() || undefined;
  return {
    title,
    description,
    openGraph: { title, description },
  };
}
```

**Fallbacks:** empty SEO title → use `entry.name` (often plus site title in the layout). Empty description → omit the tag or derive an excerpt from body fields in your frontend.

## MCP (AI agents)

The API serves **Model Context Protocol** over **Streamable HTTP** at **`/api/mcp`** (same host as GraphQL). Configure your MCP client with that URL and the same `Authorization: Bearer <api_key>` or `x-api-key` header. Keys are **scoped**: grant only the permissions the agent needs. See the API package doc `apps/api/docs/mcp-and-scoped-keys.md` in the NoteCMS repo.

## Advanced

- `postGraphql`, raw query strings in `operations.ts` (including `API_KEY_INFO`), and `client.query()` are available for custom selections.
- If the API ever returns **HTTP 200 with both `data` and `errors`**, the SDK **throws `NoteCmsError`** after GraphQL errors (partial `data` is not returned). Use `postGraphql` with a custom handler if you need partial success semantics.

## Limits

The SDK caps `entries` / `listAssets` `limit` at `MAX_GRAPHQL_PAGE_SIZE` (200) per request to reduce accidental overload. The NoteCMS API may still accept higher values from other clients.