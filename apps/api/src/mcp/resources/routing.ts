export const ROUTING_MARKDOWN = `# Note CMS — URL routing

Public URLs are computed from **content type \`options\`** + entry **\`slug\`** (and dates for optional tokens). Configure types via MCP (\`notecms_create/update_content_type\`) or the dashboard — **do not hard-code URL shapes** in the frontend.

---

## Content type \`options\` (routing)

| Field | Purpose |
|-------|---------|
| \`hasSlug\` | \`true\` required for public entry URLs |
| \`permalinkTemplate\` | Path pattern with leading \`/\`. Default: \`/:typeSlug/:slug\` |
| \`archiveEnabled\` | Adds a list/index route |
| \`archivePath\` | Archive URL (default \`/{typeSlug}\`) |
| \`homepage\` | \`{ enabled: true, entrySlug?: "home" }\` maps one entry to \`/\` |

### Template tokens

| Token | Value |
|-------|--------|
| \`:typeSlug\` | Content type slug (e.g. \`projects\`) |
| \`:slug\` | Entry slug |
| \`:id\` | Entry id |
| \`:year\`, \`:month\`, \`:day\` | From \`publishedAt\` or \`createdAt\` (UTC) |

---

## Common patterns

### Root pages + homepage

\`\`\`json
{
  "hasSlug": true,
  "permalinkTemplate": "/:slug",
  "homepage": { "enabled": true, "entrySlug": "home" }
}
\`\`\`

| Entry slug | URL |
|------------|-----|
| \`home\` | \`/\` |
| \`about\` | \`/about\` |

### Prefixed collection (blog, projects)

\`\`\`json
{
  "hasSlug": true,
  "permalinkTemplate": "/:typeSlug/:slug",
  "archiveEnabled": true,
  "archivePath": "/projects"
}
\`\`\`

| Entry slug | URL |
|------------|-----|
| \`acme-tower\` | \`/projects/acme-tower\` |
| (archive) | \`/projects\` |

Alternative fixed prefix: \`permalinkTemplate: "/blog/:slug"\`.

---

## MCP: set routing when creating a type

\`\`\`json
{
  "name": "Pages",
  "slug": "pages",
  "fields": [ … ],
  "options": {
    "hasSlug": true,
    "permalinkTemplate": "/:slug",
    "homepage": { "enabled": true, "entrySlug": "home" },
    "showInSidebar": true
  }
}
\`\`\`

Entry \`slug\` on publish must match \`homepage.entrySlug\` (after slugify) for the homepage entry.

---

## Frontend: list all static paths

\`\`\`ts
import { createNoteCmsClient, fetchBuildSnapshot, listStaticPaths } from '@notecms/sdk';

const cms = createNoteCmsClient({ endpoint, apiKey });
const snapshot = await fetchBuildSnapshot(cms);
const paths = listStaticPaths(snapshot);
\`\`\`

Each item: \`{ path, typeSlug, slug, kind?: 'entry' | 'archive' }\`.

Only **published**, non-deleted entries. **Throws** on duplicate paths — fix in CMS before deploy.

---

## Lookup entry by path

\`\`\`ts
// pathname "/about" → find descriptor in paths, then:
const entry = snapshot.slugIndex['pages']?.['about'];
\`\`\`

For homepage \`/\`, find path \`"/"\` in \`listStaticPaths\` output.

---

## Slug rules

- Set on entry via \`notecms_create_entry\` / \`notecms_update_entry\` when \`hasSlug\` is true.
- Must be unique among **published** entries of the same content type.
- Server slugifies on save (lowercase, hyphenated).

---

## Drafts vs public site

SSG and read-only API keys use **published** snapshots only. Unpublished drafts have **no** public URL until \`notecms_publish_entry\`.

---

## SDK exports (routing)

From \`@notecms/sdk\`: \`fetchBuildSnapshot\`, \`listStaticPaths\`, \`defaultPathForEntry\`, \`buildCanonicalPath\`, \`slugify\`, \`buildRouteManifestNodes\`.

Full reference: monorepo \`packages/notecms-sdk/docs/ROUTING.md\`.
`;
