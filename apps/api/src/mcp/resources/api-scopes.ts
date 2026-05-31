export const API_SCOPES_MARKDOWN = `# Note CMS — API key scopes

Scopes gate **GraphQL** and **MCP tools**. Each site API key has an explicit list. JWT dashboard sessions use **membership roles** instead (owner / editor / viewer).

## Scope matrix

| Scope | Allows |
|--------|--------|
| \`content_types:read\` | List/read content types |
| \`content_types:write\` | Create/update/delete content types |
| \`entries:read\` | List/read **published** entries (default consumer view) |
| \`entries:write\` | Create/update/delete/**publish** entries |
| \`entries:draft:read\` | See **draft** rows and draft field values in lists/get |
| \`entries:draft:write\` | Reserved for future draft-specific writes (use \`entries:write\` today) |
| \`assets:read\` | List assets |
| \`assets:write\` | Upload/update/delete assets |
| \`site_settings:read\` | Read site settings |
| \`site_settings:write\` | Update site settings |
| \`bundles:read\` | Export site bundle |
| \`bundles:write\` | Import site bundle |

## Legacy keys

Keys created **before scopes** behave as read-only:

\`content_types:read\`, \`entries:read\`, \`assets:read\`, \`site_settings:read\`

They cannot mutate via MCP until scopes are updated in the dashboard.

## Write scopes need an acting user

Any scope ending in **\`:write\`** requires an **acting user** (\`actingUserId\`) on the API key — a site member. Mutations run as that user for RBAC (\`updatedBy\`, role checks).

Minimum role for common writes:

| Operation | Role |
|-----------|------|
| Entries, assets | **editor** or higher |
| Content types, site settings (some) | **editor** or **owner** (see tool errors) |
| API key management | **owner** (JWT only, not MCP tools) |

## Recommended key sets

**Static site / CI (read-only):**

\`\`\`
content_types:read, entries:read, assets:read, site_settings:read
\`\`\`

**Content automation agent (edit + publish):**

\`\`\`
content_types:read, entries:read, entries:draft:read, entries:write,
assets:read, assets:write, site_settings:read
\`\`\`

**Schema migration (dangerous):**

Add \`content_types:write\`, \`bundles:read\`, \`bundles:write\` only when needed.

## Tool → scope quick map

| MCP tool | Scope(s) |
|----------|----------|
| \`notecms_api_key_info\` | (API key auth only) |
| \`notecms_list_content_types\` | \`content_types:read\` |
| \`notecms_create/update/delete_content_type\` | \`content_types:write\` |
| \`notecms_list/get_entry*\` | \`entries:read\` (+ \`entries:draft:read\` for drafts) |
| \`notecms_create/update/delete_entry\` | \`entries:write\` |
| \`notecms_publish_entry\` | \`entries:write\` |
| \`notecms_list_assets\` | \`assets:read\` |
| \`notecms_upload_asset\` | \`assets:write\` |
| \`notecms_get/update_site_settings\` | \`site_settings:read\` / \`site_settings:write\` |
| \`notecms_export/import_site_bundle\` | \`bundles:read\` / \`bundles:write\` |

## Checking your key

\`\`\`
notecms_api_key_info → { siteId, scopes, name, keyHint }
\`\`\`
`;
