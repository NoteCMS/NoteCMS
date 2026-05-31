# Scoped API keys and MCP

## Endpoints

- **GraphQL:** `POST /graphql` (JSON body).
- **MCP (Streamable HTTP):** `GET` and `POST /api/mcp` — same process as GraphQL.
- **Health:** `GET /health`.

In production, terminate TLS at your edge and reverse-proxy `/graphql` and `/api/mcp` to this service (or mount the whole API under a path prefix so both live behind the same upstream).

## Authentication

Use either header on every request:

- `Authorization: Bearer <jwt | ncms_v1_…>`
- `x-api-key: <ncms_v1_…>`

MCP returns **401** if neither a valid JWT nor a valid site API key is present.

## MCP resources and prompts (for agents)

The MCP server exposes **read-only markdown resources** (via `resources/list` and `resources/read`) and an optional **prompt** so agents can load conventions before using tools:

| URI | Purpose |
|-----|---------|
| `note-cms://docs/agent-guide` | **Start here** — mental model, auth, lifecycle, safety |
| `note-cms://docs/workflows` | Step-by-step recipes (new page, publish, assets, menu) |
| `note-cms://docs/tools` | Full MCP tool catalog with arguments |
| `note-cms://docs/field-types` | Entry `data` shapes (image, repeater, wysiwyg, …) |
| `note-cms://docs/api-scopes` | API key scope matrix and tool mapping |
| `note-cms://docs/frontend-sdk` | Writing site code with `@notecms/sdk` |
| `note-cms://docs/routing` | Permalinks, homepage, SSG paths |

Prompt **`notecms_agent_bootstrap`** returns starter instructions that point at these URIs. Clients that support MCP prompts/resources should surface them to the model.

## Site API keys

- Each key is tied to **exactly one site**. You can omit `siteId` in GraphQL variables when using a key; the server uses the key’s site. If you pass `siteId`, it **must** match the key.
- **Legacy keys** (created before scopes) behave like read-only: `content_types:read`, `entries:read`, `assets:read`, `site_settings:read`.
- **New keys** require at least one scope. Any scope ending in `:write` requires an **acting user** (a site member); mutations run as that user for RBAC and `updatedBy`.
- **JWT-only (no key):** managing keys (`createApiKey`, `revokeApiKey`, `apiKeys`), user admin, and similar stay session/JWT-only.

## Scope reference

| Scope | Access |
|--------|--------|
| `content_types:read` | `contentTypes` |
| `content_types:write` | create/update/delete content types |
| `entries:read` | `entries`, `entry`, `entryBySlug` |
| `entries:write` | create/update/delete/**publish** entries |
| `assets:read` | `listAssets` |
| `assets:write` | upload/update/delete assets |
| `site_settings:read` | `siteSettings` |
| `site_settings:write` | `updateSiteSettings` |
| `bundles:read` | `exportSiteBundle` |
| `bundles:write` | `importSiteBundle` |

## Enabling MCP per workspace

In the dashboard (**API keys**), workspace admins can toggle **Allow MCP for this workspace**. When off, `/api/mcp` returns **403** for that site (API keys and JWTs that include the workspace id). GraphQL is unaffected. The flag is stored on `SiteSettings` as `mcpEnabled` (default true).

## GraphQL: `apiKeyInfo`

For SDK/bootstrap:

```graphql
query { apiKeyInfo { siteId scopes name keyHint } }
```

Only succeeds when authenticated with a site API key.

## Example: Cursor MCP (illustrative)

Point the MCP server URL at your deployed API, e.g. `https://notecms.example.com/api/mcp`, and configure the client to send the API key in headers (exact shape depends on the MCP client). Prefer a **narrow** scope set and a dedicated key per integration.

## Security

- Do not expose API keys in browser bundles or public repos.
- Treat `/api/mcp` like `/graphql`: rate limit and monitor if exposed on the public internet. **Authenticated** MCP traffic (API key or JWT) is not rate limited. **Unauthenticated** probes are limited per IP (default 60 requests / 15 minutes). Set `MCP_RATE_LIMIT_UNAUTH_MAX=0` to disable.
