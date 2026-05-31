export const TOOLS_MARKDOWN = `# Note CMS MCP — tools catalog

All tools return JSON text. Errors include hints to read \`note-cms://docs/agent-guide\`.

Optional **\`siteId\`** on every site-scoped tool — omit when using a site API key.

---

## Read-only

### \`notecms_api_key_info\`

Returns \`{ siteId, scopes, name, keyHint }\` for the **current API key**. Fails with JWT-only auth.

### \`notecms_list_content_types\`

Lists types with \`id\`, \`slug\`, \`name\`, \`fields\`, \`options\`. **Call before any entry work.**

### \`notecms_list_entries\`

| Arg | Required | Notes |
|-----|----------|-------|
| \`contentTypeId\` | yes | From list content types |
| \`limit\`, \`offset\` | no | Default limit 30, max 200 |
| \`includeDrafts\` | no | Needs \`entries:draft:read\` |
| \`includeDeleted\` | no | Soft-deleted entries |
| \`updatedSince\` | no | ISO 8601 — incremental sync |

### \`notecms_get_entry\`

Load one entry by \`id\` including full \`data\`.

### \`notecms_get_entry_by_slug\`

Args: \`contentTypeSlug\`, \`slug\`. For types with public slugs.

### \`notecms_list_assets\`

Optional \`query\` (filename substring), pagination.

### \`notecms_get_site_settings\`

Site title, \`menuEntries\`, logo/favicon asset ids, \`mcpEnabled\`.

### \`notecms_export_site_bundle\`

Large JSON export. Args \`options\`: \`siteSettings\`, \`contentTypes\`, \`contentTypeSlugsForEntries[]\`, \`assets\`. Needs \`bundles:read\`.

---

## Write — content types

### \`notecms_create_content_type\`

\`name\`, \`slug\`, \`fields[]\`, optional \`options\`. Needs \`content_types:write\`.

### \`notecms_update_content_type\`

Patch by \`id\`. Changing \`fields\` can invalidate existing entry data.

### \`notecms_delete_content_type\`

Fails if entries still exist.

---

## Write — entries

### \`notecms_create_entry\`

\`contentTypeId\`, \`name\`, optional \`slug\`, \`data\` object. Creates a **draft**.

### \`notecms_update_entry\`

Patch \`name\`, \`slug\`, \`data\` by entry \`id\`. Merges/replaces \`data\` keys you send.

### \`notecms_publish_entry\`

Args: entry \`id\`. Makes draft live. Needs \`entries:write\` + editor role. Fails on slug collision within the same content type.

### \`notecms_delete_entry\`

Soft-delete (\`deletedAt\`). Restore via GraphQL \`restoreEntry\` (not exposed as MCP tool yet).

---

## Write — assets

### \`notecms_upload_asset\`

| Arg | Required | Notes |
|-----|----------|-------|
| \`fileBase64\` | yes | Raw base64, **not** a \`data:\` URL |
| \`filename\` | yes | e.g. \`hero.webp\` |
| \`mimeType\` | yes | \`image/jpeg\`, \`image/png\`, \`image/webp\`, \`image/gif\`, \`image/svg+xml\`, ico types |
| \`alt\`, \`title\` | no | Metadata |
| \`focalX\`, \`focalY\` | no | 0–1 crop focal point (default 0.5) |

Returns \`id\` and \`focalPoint\` — use \`id\` in \`image\` fields. Needs \`assets:write\`.

---

## Write — site & bundles

### \`notecms_update_site_settings\`

\`input\` object: \`siteTitle\`, \`menuEntries\`, \`logoAssetId\`, \`faviconAssetId\`, \`mcpEnabled\`, etc.

### \`notecms_import_site_bundle\`

**Destructive** partial/full merge. Needs \`bundles:write\`. Same \`options\` shape as export.

---

## GraphQL parity

These MCP tools wrap the same resolvers as \`POST /graphql\`. Anything not listed (schedule publish, unpublish, API keys, publish webhooks) is **GraphQL-only** today — use the dashboard or direct GraphQL if needed.
`;
