import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/** Stable URIs for MCP resources/read (list_resources exposes these). */
export const MCP_RESOURCE_AGENT_GUIDE_URI = 'note-cms://docs/agent-guide';
export const MCP_RESOURCE_API_SCOPES_URI = 'note-cms://docs/api-scopes';

export const AGENT_GUIDE_MARKDOWN = `# Note CMS MCP — agent guide

## What this server is

Note CMS is a **multi-site headless CMS**. This MCP server exposes **GraphQL-backed tools** for one workspace at a time. All mutations are enforced server-side (scopes + RBAC).

## Before you change anything

1. Call **\`notecms_api_key_info\`** when using an **API key** so you know **\`siteId\`**, **scopes**, and key name.
2. Call **\`notecms_list_content_types\`** before creating entries so you use real **\`contentTypeId\`** values and understand **\`fields\`** / options (e.g. **\`hasSlug\`**).
3. Prefer **read** tools (\`list_entries\`, \`get_entry\`, …) before **write** tools.

## Workspace selection (\`siteId\`)

- **Site API key:** the key is pinned to one site. You may **omit** \`siteId\` on tools; if you pass it, it **must** match the key’s site.
- **JWT (dashboard session):** pass **\`siteId\`** for site-scoped operations when required.
- Wrong or mismatched \`siteId\` → GraphQL errors / forbidden.

## Scopes and writes

- Each API key has a **scope list** (e.g. \`entries:read\`, \`entries:write\`). A tool fails if the key lacks permission.
- Scopes ending in **\`:write\`** require an **acting user** on the key; the server runs mutations as that member for RBAC and audit fields.
- Read the scope matrix: **\`${MCP_RESOURCE_API_SCOPES_URI}\`** (resource).

## MCP toggle per workspace

If **MCP is disabled** for a site, **\`/api/mcp\`** returns **403** for that workspace (API key or JWT with that \`siteId\`). GraphQL from the UI is unchanged.

## Content and data shape

- **Entries** store **\`data\`** as a JSON object keyed by **field \`key\`** from the content type schema. Respect **\`required\`**, field **\`type\`**, and **repeater** / nested shapes from \`contentTypes\` → \`fields\`.
- **Slugs:** only when the type has **\`hasSlug\`** (or equivalent in \`options\`). Do not invent URL slugs for types that do not expose them.
- **Site settings** updates (\`notecms_update_site_settings\`) can affect **menus**, **title**, **logo/favicon** ids — confirm values before saving.

## Bundles

- **\`export_site_bundle\`** / **\`import_site_bundle\`** are powerful. Import can **overwrite** large parts of a site. Use narrow **options**, verify **\`siteId\`**, and treat production imports as **destructive** unless you have a backup.

## What not to do

- Do **not** assume field keys or content type ids — always **list** first.
- Do **not** retry destructive operations in a loop on failure — read the error (scope vs validation vs not found).
- Do **not** expose or log raw API key tokens in user-visible text.

## Hints on tool errors

If a tool returns an error string, it often means **missing scope**, **wrong \`siteId\`**, **MCP disabled**, or **GraphQL validation**. Re-read **\`notecms_api_key_info\`** and this guide, then adjust.
`;

export const API_SCOPES_MARKDOWN = `# Note CMS — API key scopes (MCP / GraphQL)

| Scope | Access |
|--------|--------|
| \`content_types:read\` | List/read content types |
| \`content_types:write\` | Create/update/delete content types |
| \`entries:read\` | List/read entries |
| \`entries:write\` | Create/update/delete entries |
| \`assets:read\` | List/read assets |
| \`assets:write\` | Upload/update/delete assets |
| \`site_settings:read\` | Read site settings |
| \`site_settings:write\` | Update site settings |
| \`bundles:read\` | Export site bundle |
| \`bundles:write\` | Import site bundle |

**Legacy keys** (created before scopes) behave as read-only for the rows above.

**Write scopes** require an **acting user** (site member) on the key so the API can enforce RBAC.
`;

function markdownResource(uri: string, body: string) {
  return {
    contents: [
      {
        uri,
        mimeType: 'text/markdown' as const,
        text: body,
      },
    ],
  };
}

/** Registers static markdown resources + a bootstrap prompt for MCP clients. */
export function registerAgentContextArtifacts(server: McpServer) {
  server.registerResource(
    'agent-guide',
    MCP_RESOURCE_AGENT_GUIDE_URI,
    {
      title: 'Note CMS MCP — agent guide',
      description: 'Conventions, siteId, safety, and what not to do. Read first in a new session.',
      mimeType: 'text/markdown',
    },
    async (uri) => markdownResource(uri.href, AGENT_GUIDE_MARKDOWN),
  );

  server.registerResource(
    'api-scopes',
    MCP_RESOURCE_API_SCOPES_URI,
    {
      title: 'Note CMS — API key scopes',
      description: 'Scope names and what each permission allows (for MCP tools and GraphQL).',
      mimeType: 'text/markdown',
    },
    async (uri) => markdownResource(uri.href, API_SCOPES_MARKDOWN),
  );

  const bootstrapBody = `You are connected to **Note CMS** over MCP (headless CMS).

**Do this before mutating data:**
1. Use MCP **resources/read** on \`${MCP_RESOURCE_AGENT_GUIDE_URI}\` for full conventions.
2. Use **resources/read** on \`${MCP_RESOURCE_API_SCOPES_URI}\` for the scope matrix.
3. Call tool **notecms_api_key_info** if authenticated with an API key (ignore errors for JWT-only).

Then use read-only tools (content types, entries, settings) to learn the workspace, and only then use write tools with minimal scope.`;

  server.registerPrompt(
    'notecms_agent_bootstrap',
    {
      title: 'Note CMS — agent bootstrap',
      description:
        'Optional starter prompt: tells the agent to read built-in MCP resources and api_key_info before writes.',
    },
    async () => ({
      description: 'Pulls in onboarding text for Note CMS MCP.',
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: bootstrapBody,
          },
        },
      ],
    }),
  );
}
