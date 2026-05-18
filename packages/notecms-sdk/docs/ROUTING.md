# URL routing with @notecms/sdk

> **For AI agents:** This is the canonical routing reference for `@notecms/sdk`.  
> **Search terms:** `listStaticPaths`, `fetchBuildSnapshot`, `permalinkTemplate`, `homepage`, `buildCanonicalPath`, `slugIndex`, `buildRouteManifest`, SSG, static paths.  
> **When to read this:** implementing site URLs, `generateStaticParams`, SvelteKit `entries()`, homepage at `/`, or resolving an entry from a pathname.

## Quick decision guide

| Goal | Use |
|------|-----|
| Build all URLs for a static site (SSG) | `fetchBuildSnapshot` → `listStaticPaths(snapshot)` |
| Look up entry by type + slug segment | `snapshot.slugIndex[typeSlug][entrySlug]` (types with `hasSlug` only) |
| Path for one entry you already have | `defaultPathForEntry(typeSlug, entry, contentType)` or `buildCanonicalPath({ contentType, entry })` |
| Live/admin path on a single entry | GraphQL `entry { canonicalPath }` |
| Full route list from API without snapshot | GraphQL `buildRouteManifest(siteId: …)` |
| Validate or preview paths in tooling | `buildRouteManifestNodes(contentTypes, entries)` |
| Slug sanitization (same rules as CMS) | `slugify(text)` |

**Rule:** URL rules live on the **content type** (`options`). Entries only supply **slug** (+ dates for optional tokens). Do not invent URL patterns in the site — read them from `contentType.options` or use SDK helpers above.

---

## Content type `options` (CMS configuration)

Configured in NoteCMS admin per content type. Stored on `ContentType.options` (JSON).

| Field | Type | Description |
|-------|------|-------------|
| `hasSlug` | `boolean` | Required for public URLs. If false, entries have no canonical path. |
| `permalinkTemplate` | `string` | Path pattern, leading `/`. Default: `/:typeSlug/:slug`. |
| `archiveEnabled` | `boolean` | If true, adds an index/list route for this type. |
| `archivePath` | `string` | Archive URL; default `/{contentType.slug}` when archive enabled. |
| `homepage` | `{ enabled: true, entrySlug?: string }` | Maps one **published** entry slug to `/`. Only when template has **no** `:typeSlug`. Default `entrySlug`: `"home"`. |

### Permalink tokens

| Token | Replaced with |
|-------|----------------|
| `:typeSlug` | Slugified content type slug (e.g. `projects`) |
| `:slug` | Slugified entry slug (required in template when `hasSlug`) |
| `:id` | Entry id |
| `:year`, `:month`, `:day` | UTC from `publishedAt`, else `createdAt`; empty if no date |

Paths are normalized: leading `/`, no trailing `/` except exactly `/`.

---

## Patterns: pages vs prefixed types

### Pages (root URLs, optional homepage)

Typical **Pages** type (`slug` often `page`):

```json
{
  "hasSlug": true,
  "permalinkTemplate": "/:slug",
  "homepage": { "enabled": true, "entrySlug": "home" }
}
```

| Entry slug | Canonical path |
|------------|----------------|
| `home` (homepage entry) | `/` |
| `about` | `/about` |

Homepage logic: `homepage.enabled` + root-style template (no `:typeSlug`) + entry slug matches `homepage.entrySlug` (after `slugify`) → `/`.

### Prefixed type (e.g. projects)

Typical **Projects** type (`slug` `projects`):

```json
{
  "hasSlug": true,
  "permalinkTemplate": "/:typeSlug/:slug",
  "archiveEnabled": true,
  "archivePath": "/projects"
}
```

| Entry slug | Canonical path |
|------------|----------------|
| `acme-tower` | `/projects/acme-tower` |
| (archive route) | `/projects` |

Alternative fixed prefix: `permalinkTemplate: "/projects/:slug"` (set `archivePath` manually if you need an index).

---

## Static site workflow (recommended)

```ts
import { createNoteCmsClient, fetchBuildSnapshot, listStaticPaths } from '@notecms/sdk';

const cms = createNoteCmsClient({
  endpoint: process.env.NOTECMS_GRAPHQL_URL!,
  apiKey: process.env.NOTECMS_API_KEY!,
});

const snapshot = await fetchBuildSnapshot(cms);
const paths = listStaticPaths(snapshot);
```

### `listStaticPaths` result

Each item:

```ts
type StaticPathDescriptor = {
  path: string;       // e.g. "/", "/about", "/projects/acme-tower"
  typeSlug: string;   // content type slug, e.g. "page", "projects"
  slug: string;       // entry slug; "" for archive routes
  kind?: 'entry' | 'archive';
};
```

- Only **published**, non-deleted entries (same rules as `buildRouteManifestNodes`).
- **Throws** if two routes resolve to the same `path` (fix in CMS before deploy).

### `BuildSnapshot` routing fields

| Field | Use |
|-------|-----|
| `contentTypes` | Each type’s `options` (permalink, homepage, archive) |
| `entriesByTypeSlug` | All entries per type slug |
| `slugIndex[typeSlug][entrySlug]` | Fast entry lookup when `hasSlug` |
| `entriesById` | Lookup by entry id |

Check `snapshot.snapshotFormatVersion` when caching snapshots across SDK upgrades.

---

## Resolve path for one entry

```ts
import { defaultPathForEntry, contentTypeHasSlug } from '@notecms/sdk';

const ct = snapshot.contentTypes.find((c) => c.slug === 'projects')!;
const entry = snapshot.entriesById['…'];
if (contentTypeHasSlug(ct)) {
  const path = defaultPathForEntry('projects', entry, ct); // "/projects/foo" or null
}
```

Lower-level (same algorithm):

```ts
import { buildCanonicalPath } from '@notecms/sdk';

buildCanonicalPath({
  contentType: { slug: 'page', options: ct.options as Record<string, unknown> },
  entry: { id: entry.id, slug: entry.slug, publishedAt: entry.publishedAt, createdAt: entry.createdAt },
});
```

Returns `null` if type has no slug, entry has no slug, or path cannot be built.

---

## GraphQL (without full snapshot)

```graphql
query {
  entry(siteId: "…", id: "…") {
    slug
    canonicalPath
  }
  buildRouteManifest(siteId: "…")
}
```

`buildRouteManifest` returns the same node shape as `buildRouteManifestNodes` (JSON array of `{ path, kind, contentTypeSlug, entryId?, entrySlug? }`).

---

## Framework mapping (sketch)

**SvelteKit** — generate params from paths:

```ts
export async function entries() {
  const paths = listStaticPaths(await getSnapshot());
  return paths.map((p) => ({ path: p.path === '/' ? '' : p.path.slice(1) }));
}
```

**Next.js App Router** — `generateStaticParams` from `paths.map(p => ({ slug: segments }))` according to your `[...slug]` structure.

**Catch-all route handler** — normalize request pathname, find matching `StaticPathDescriptor.path`, then load via `slugIndex[p.typeSlug][p.slug]` or `entriesById`.

---

## Errors and constraints

- **Route collision:** `listStaticPaths` / `buildRouteManifestNodes` throw with both conflicting routes — resolve in CMS (duplicate paths across types or archive vs entry).
- **Homepage:** only allowed with templates that omit `:typeSlug` (e.g. `/:slug`).
- **Drafts:** manifest includes `lifecycleStatus === 'published'` only; use `fetchBuildSnapshot({ includeDrafts: true })` only for staging, not public SSG.
- **API keys:** default snapshot is published content; draft scope requires key permission.

---

## Exported API surface (routing-related)

From `@notecms/sdk`:

- **Snapshot / SSG:** `fetchBuildSnapshot`, `listStaticPaths`, `StaticPathDescriptor`, `BuildSnapshot`
- **Helpers:** `defaultPathForEntry`, `contentTypeHasSlug`
- **Engine:** `buildCanonicalPath`, `buildArchivePath`, `buildRouteManifestNodes`, `slugify`
- **Types/options:** `ContentTypeRoutingInput`, `EntryRoutingInput`, `HomepageOption`, `RouteManifestNode`, `normalizeContentTypeRoutingOptions`, `getDefaultPermalinkTemplate`, `effectivePermalinkTemplate`, `parseHomepageOption`, `isRootStylePermalinkTemplate`, `validatePermalinkTemplateString`

Implementation source in the NoteCMS monorepo: `packages/routing` (bundled into the published SDK).
