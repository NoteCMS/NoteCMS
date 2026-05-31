import {
  MCP_RESOURCE_API_SCOPES_URI,
  MCP_RESOURCE_FIELD_TYPES_URI,
  MCP_RESOURCE_FRONTEND_SDK_URI,
  MCP_RESOURCE_ROUTING_URI,
  MCP_RESOURCE_TOOLS_URI,
  MCP_RESOURCE_WORKFLOWS_URI,
} from '../resource-uris.js';

export const AGENT_GUIDE_MARKDOWN = `# Note CMS MCP — start here

Note CMS is a **multi-site headless CMS**. This MCP server exposes **GraphQL-backed tools** for managing one workspace (site) at a time. Use it to inspect schemas, edit content, upload media, and publish — the same data your frontend reads via \`@notecms/sdk\`.

## First session checklist

1. **\`notecms_api_key_info\`** — when using a site API key: learn \`siteId\`, \`scopes\`, key name.
2. **\`notecms_list_content_types\`** — always before creating entries; copy real \`contentTypeId\` and \`fields\`.
3. **\`notecms_get_site_settings\`** — site title, menu map, logo/favicon ids, \`mcpEnabled\`.
4. Read resources (pick what you need):
   - **Tools catalog:** \`${MCP_RESOURCE_TOOLS_URI}\`
   - **Field data shapes:** \`${MCP_RESOURCE_FIELD_TYPES_URI}\`
   - **Common workflows:** \`${MCP_RESOURCE_WORKFLOWS_URI}\`
   - **Scopes:** \`${MCP_RESOURCE_API_SCOPES_URI}\`
   - **Frontend / SDK code:** \`${MCP_RESOURCE_FRONTEND_SDK_URI}\`
   - **URLs & routing:** \`${MCP_RESOURCE_ROUTING_URI}\`

Use **read** tools before **write** tools. Never guess ids or field keys.

---

## Mental model

| Concept | What it is |
|---------|------------|
| **Site / workspace** | One isolated CMS tenant (\`siteId\`). API keys are pinned to exactly one site. |
| **Content type** | Schema: \`fields[]\` + \`options\` (slugs, sidebar, permalink rules). |
| **Entry** | One document of a type: \`name\`, optional \`slug\`, \`data\` (field values), **lifecycle** (draft vs published). |
| **Asset** | Uploaded image in the media library; referenced from \`image\` fields by \`assetId\`. |
| **Draft vs published** | \`update_entry\` saves **draft**. Public sites and read-only API keys see **published** snapshots only until you **publish**. |

---

## Authentication & \`siteId\`

**Headers** (same as GraphQL):

- \`Authorization: Bearer <jwt | ncms_v1_…>\`
- \`x-api-key: <ncms_v1_…>\`

| Auth | \`siteId\` on tools |
|------|---------------------|
| **Site API key** | Optional — server uses the key’s site. If you pass \`siteId\`, it **must match**. |
| **JWT (dashboard user)** | Pass \`siteId\` for site-scoped tools when required. |

**Write operations** need:

- Matching **API key scope** (e.g. \`entries:write\`), and
- **Acting user** on the key (site member) for RBAC, or JWT with **editor+** role on the site.

---

## MCP enabled per workspace

\`SiteSettings.mcpEnabled\` (default \`true\`) can disable MCP for a site. When off, \`/api/mcp\` returns **403** for that workspace. GraphQL UI access is unchanged.

---

## Entry lifecycle (important)

| Status | Meaning |
|--------|---------|
| \`draft\` | Work in progress; not on public site (unless staging key). |
| \`published\` | Live snapshot in \`publishedName\` / \`publishedSlug\` / \`publishedData\`. |

**Typical edit flow:**

1. \`notecms_create_entry\` or \`notecms_update_entry\` — writes **draft**.
2. \`notecms_publish_entry\` — copies draft → published; entry appears on site / in SSG.

\`hasUnpublishedChanges: true\` on a published entry means draft differs from live.

API keys **without** \`entries:draft:read\` only see **published** content in list/get tools.

---

## Content type \`options\` (high level)

From \`notecms_list_content_types\` → \`options\`:

| Option | Purpose |
|--------|---------|
| \`hasSlug\` | Entry needs a \`slug\` for public URLs. |
| \`showInSidebar\`, \`sidebarOrder\` | Admin navigation. |
| \`permalinkTemplate\` | URL pattern, e.g. \`/:slug\` or \`/:typeSlug/:slug\`. |
| \`homepage\` | Map one entry slug to \`/\` (root templates only). |
| \`archiveEnabled\`, \`archivePath\` | List/index route for a type. |

Full URL rules: \`${MCP_RESOURCE_ROUTING_URI}\`.

---

## Safety

- **Bundles** (\`export\` / \`import\`) can overwrite large parts of a site — narrow \`options\`, verify \`siteId\`, avoid production imports without backup.
- **Site settings** (\`menuEntries\`, logo/favicon ids) break navigation if wrong — read first.
- Do **not** log or echo raw API key tokens.
- On tool errors: check scope, \`siteId\`, MCP toggle, validation (field types). See \`${MCP_RESOURCE_API_SCOPES_URI}\`.

---

## Building a frontend?

You usually **manage content via MCP** (this server) and **read content in the site app** via \`@notecms/sdk\` (GraphQL, server-only API key). See \`${MCP_RESOURCE_FRONTEND_SDK_URI}\`.

---

## Prompt

MCP clients may expose prompt **\`notecms_agent_bootstrap\`** — short onboarding that points at these resources.
`;
