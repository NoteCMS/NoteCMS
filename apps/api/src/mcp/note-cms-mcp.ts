import type { ApolloServer } from '@apollo/server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { RequestContext } from '../auth/types.js';
import { executeGraphql } from '../graphql/execute-internal.js';
import {
  MCP_RESOURCE_AGENT_GUIDE_URI,
  MCP_RESOURCE_API_SCOPES_URI,
  registerAgentContextArtifacts,
} from './mcp-agent-context.js';

const siteIdOpt = z
  .string()
  .optional()
  .describe(
    'Workspace (site) id. Omit when the HTTP auth is a site-scoped API key—the server uses the key’s site. If set with an API key, it must match that key’s site. JWT users should pass the target workspace id when required.',
  );

function jsonResult(payload: unknown, preface?: string) {
  const content: Array<{ type: 'text'; text: string }> = [];
  if (preface?.trim()) {
    content.push({ type: 'text', text: preface.trim() });
  }
  content.push({ type: 'text', text: JSON.stringify(payload, null, 2) });
  return { content };
}

const graphqlErrorHint = `Hint: read MCP resources \`${MCP_RESOURCE_AGENT_GUIDE_URI}\` and \`${MCP_RESOURCE_API_SCOPES_URI}\`; call notecms_api_key_info when using an API key.`;

async function graphqlTool<T>(run: () => Promise<T>, preface?: string) {
  try {
    const data = await run();
    return jsonResult(data, preface);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      content: [{ type: 'text' as const, text: `${graphqlErrorHint}\n\n${msg}` }],
      isError: true as const,
    };
  }
}

/** Inline operations for MCP tools (siteId optional when ctx has apiKey). */
const Q = {
  apiKeyInfo: `query { apiKeyInfo { siteId scopes name keyHint } }`,
  contentTypes: `query($siteId: ID) { contentTypes(siteId: $siteId) { id siteId name slug fields options } }`,
  entries: `query($siteId: ID, $contentTypeId: ID!, $limit: Int, $offset: Int) {
    entries(siteId: $siteId, contentTypeId: $contentTypeId, limit: $limit, offset: $offset) {
      id siteId contentTypeId name slug data updatedAt lastEditedBy { id email }
    }
  }`,
  entry: `query($id: ID!, $siteId: ID) { entry(id: $id, siteId: $siteId) { id siteId contentTypeId name slug data updatedAt lastEditedBy { id email } } }`,
  entryBySlug: `query($siteId: ID, $contentTypeSlug: String!, $slug: String!) {
    entryBySlug(siteId: $siteId, contentTypeSlug: $contentTypeSlug, slug: $slug) {
      id siteId contentTypeId name slug data updatedAt lastEditedBy { id email }
    }
  }`,
  listAssets: `query($siteId: ID, $query: String, $limit: Int, $offset: Int) {
    listAssets(siteId: $siteId, query: $query, limit: $limit, offset: $offset) { id filename mimeType alt title }
  }`,
  siteSettings: `query($siteId: ID) { siteSettings(siteId: $siteId) { id siteId siteTitle menuEntries logoAssetId faviconAssetId mcpEnabled } }`,
  exportBundle: `query($siteId: ID, $options: SiteBundlePartOptions!) { exportSiteBundle(siteId: $siteId, options: $options) }`,
};

const M = {
  createContentType: `mutation($siteId: ID, $name: String!, $slug: String!, $fields: [FieldInput!]!, $options: JSON) {
    createContentType(siteId: $siteId, name: $name, slug: $slug, fields: $fields, options: $options) { id name slug }
  }`,
  updateContentType: `mutation($id: ID!, $siteId: ID, $name: String, $slug: String, $fields: [FieldInput!], $options: JSON) {
    updateContentType(id: $id, siteId: $siteId, name: $name, slug: $slug, fields: $fields, options: $options) { id name slug }
  }`,
  deleteContentType: `mutation($id: ID!, $siteId: ID) { deleteContentType(id: $id, siteId: $siteId) }`,
  createEntry: `mutation($siteId: ID, $contentTypeId: ID!, $name: String!, $slug: String, $data: JSON!) {
    createEntry(siteId: $siteId, contentTypeId: $contentTypeId, name: $name, slug: $slug, data: $data) { id name slug }
  }`,
  updateEntry: `mutation($id: ID!, $siteId: ID, $name: String, $slug: String, $data: JSON) {
    updateEntry(id: $id, siteId: $siteId, name: $name, slug: $slug, data: $data) { id name slug }
  }`,
  deleteEntry: `mutation($id: ID!, $siteId: ID) { deleteEntry(id: $id, siteId: $siteId) }`,
  updateSiteSettings: `mutation($siteId: ID, $input: SiteSettingsInput!) {
    updateSiteSettings(siteId: $siteId, input: $input) { id siteId siteTitle menuEntries }
  }`,
  importBundle: `mutation($siteId: ID, $bundle: JSON!, $options: SiteBundlePartOptions!) {
    importSiteBundle(siteId: $siteId, bundle: $bundle, options: $options) {
      contentTypesUpserted entriesCreated entriesUpdated assetsImported siteSettingsApplied
    }
  }`,
};

export function createNoteCmsMcpServer(apollo: ApolloServer<RequestContext>, ctx: RequestContext): McpServer {
  const server = new McpServer({
    name: 'note-cms',
    version: '1.0.0',
  });

  registerAgentContextArtifacts(server);

  server.registerTool(
    'notecms_api_key_info',
    {
      title: 'API key metadata',
      description:
        'Returns siteId, scopes, name, and keyHint for the **current site API key**. Fails with JWT-only auth—use this first when the transport uses a key so you know which workspace is pinned and what you are allowed to do.',
      annotations: { readOnlyHint: true },
    },
    async () =>
      graphqlTool(() => executeGraphql<{ apiKeyInfo: unknown }>(apollo, ctx, Q.apiKeyInfo)),
  );

  server.registerTool(
    'notecms_list_content_types',
    {
      title: 'List content types',
      description:
        'Lists all content types in the workspace with **fields** and **options** (including slug/hasSlug behavior). Call this before creating entries or guessing field keys.',
      inputSchema: { siteId: siteIdOpt },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      graphqlTool(() =>
        executeGraphql<{ contentTypes: unknown[] }>(apollo, ctx, Q.contentTypes, {
          siteId: args?.siteId ?? null,
        }),
      ),
  );

  server.registerTool(
    'notecms_list_entries',
    {
      title: 'List entries',
      description:
        'Lists entries for one **contentTypeId** (newest first). Use **notecms_list_content_types** to resolve ids. Paginate with limit/offset.',
      inputSchema: {
        siteId: siteIdOpt,
        contentTypeId: z.string().describe('Content type id from contentTypes.id'),
        limit: z.number().int().min(1).max(200).optional().describe('Page size (default 30, max 200)'),
        offset: z.number().int().min(0).optional().describe('Skip this many rows'),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      graphqlTool(() =>
        executeGraphql<{ entries: unknown[] }>(apollo, ctx, Q.entries, {
          siteId: args?.siteId ?? null,
          contentTypeId: args!.contentTypeId,
          limit: args?.limit ?? 30,
          offset: args?.offset ?? 0,
        }),
      ),
  );

  server.registerTool(
    'notecms_get_entry',
    {
      title: 'Get entry by id',
      description: 'Loads one entry including **data** JSON. Requires **entries:read** (or equivalent JWT access).',
      inputSchema: {
        siteId: siteIdOpt,
        id: z.string().describe('Entry id'),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      graphqlTool(() =>
        executeGraphql<{ entry: unknown }>(apollo, ctx, Q.entry, {
          siteId: args?.siteId ?? null,
          id: args!.id,
        }),
      ),
  );

  server.registerTool(
    'notecms_get_entry_by_slug',
    {
      title: 'Get entry by slug',
      description:
        'Resolves an entry from the content type **slug** (URL key of the type) plus the entry **slug**. Only meaningful for types configured with public slugs.',
      inputSchema: {
        siteId: siteIdOpt,
        contentTypeSlug: z.string().describe('Content type slug field, e.g. pages'),
        slug: z.string().describe('Entry slug value'),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      graphqlTool(() =>
        executeGraphql<{ entryBySlug: unknown }>(apollo, ctx, Q.entryBySlug, {
          siteId: args?.siteId ?? null,
          contentTypeSlug: args!.contentTypeSlug,
          slug: args!.slug,
        }),
      ),
  );

  server.registerTool(
    'notecms_list_assets',
    {
      title: 'List assets',
      description: 'Lists media library assets; optional **query** filters by filename substring.',
      inputSchema: {
        siteId: siteIdOpt,
        query: z.string().optional().describe('Filename search substring'),
        limit: z.number().int().optional(),
        offset: z.number().int().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      graphqlTool(() =>
        executeGraphql<{ listAssets: unknown[] }>(apollo, ctx, Q.listAssets, {
          siteId: args?.siteId ?? null,
          query: args?.query ?? '',
          limit: args?.limit ?? 30,
          offset: args?.offset ?? 0,
        }),
      ),
  );

  server.registerTool(
    'notecms_get_site_settings',
    {
      title: 'Get site settings',
      description:
        'Returns site title, menu entry id map, logo/favicon asset ids, and **mcpEnabled**. Read before changing navigation or branding.',
      inputSchema: { siteId: siteIdOpt },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      graphqlTool(() =>
        executeGraphql<{ siteSettings: unknown }>(apollo, ctx, Q.siteSettings, {
          siteId: args?.siteId ?? null,
        }),
      ),
  );

  server.registerTool(
    'notecms_export_site_bundle',
    {
      title: 'Export site bundle',
      description:
        'Exports a large JSON bundle (settings, types, entries, assets flags). Needs **bundles:read**. Can be slow and sensitive—prefer narrow **options**.',
      inputSchema: {
        siteId: siteIdOpt,
        siteSettings: z.boolean(),
        contentTypes: z.boolean(),
        contentTypeSlugsForEntries: z.array(z.string()),
        assets: z.boolean(),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      graphqlTool(() =>
        executeGraphql<{ exportSiteBundle: unknown }>(apollo, ctx, Q.exportBundle, {
          siteId: args?.siteId ?? null,
          options: {
            siteSettings: args!.siteSettings,
            contentTypes: args!.contentTypes,
            contentTypeSlugsForEntries: args!.contentTypeSlugsForEntries,
            assets: args!.assets,
          },
        }),
      ),
  );

  server.registerTool(
    'notecms_create_content_type',
    {
      title: 'Create content type',
      description:
        'Creates a schema (**fields** array, **options** JSON). Requires **content_types:write** and usually an acting user on the key. Breaking changes affect every entry of this type.',
      inputSchema: {
        siteId: siteIdOpt,
        name: z.string(),
        slug: z.string(),
        fields: z.array(z.unknown()).describe('Field definitions: [{ key, label, type, required?, config? }, …]'),
        options: z.record(z.string(), z.unknown()).optional().describe('e.g. hasSlug, showInSidebar, sidebarOrder'),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      graphqlTool(() =>
        executeGraphql<{ createContentType: unknown }>(apollo, ctx, M.createContentType, {
          siteId: args?.siteId ?? null,
          name: args!.name,
          slug: args!.slug,
          fields: args!.fields as Record<string, unknown>[],
          options: args?.options ?? {},
        }),
      ),
  );

  server.registerTool(
    'notecms_update_content_type',
    {
      title: 'Update content type',
      description:
        'Patches name, slug, fields, and/or options. Requires **content_types:write**. Can invalidate existing entry **data** if fields change—coordinate with editors.',
      inputSchema: {
        id: z.string().describe('Content type id'),
        siteId: siteIdOpt,
        name: z.string().optional(),
        slug: z.string().optional(),
        fields: z.array(z.unknown()).optional(),
        options: z.record(z.string(), z.unknown()).optional(),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      graphqlTool(() =>
        executeGraphql<{ updateContentType: unknown }>(apollo, ctx, M.updateContentType, {
          id: args!.id,
          siteId: args?.siteId ?? null,
          name: args?.name,
          slug: args?.slug,
          fields: args?.fields as Record<string, unknown>[] | undefined,
          options: args?.options,
        }),
      ),
  );

  server.registerTool(
    'notecms_delete_content_type',
    {
      title: 'Delete content type',
      description:
        'Permanently removes a content type. Requires **content_types:write**. Typically fails if entries still exist—list/delete entries first.',
      inputSchema: { id: z.string().describe('Content type id'), siteId: siteIdOpt },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async (args) =>
      graphqlTool(
        () =>
          executeGraphql<{ deleteContentType: boolean }>(apollo, ctx, M.deleteContentType, {
            id: args!.id,
            siteId: args?.siteId ?? null,
          }),
        'This deletes the content type definition. Confirm no dependent entries and backups.',
      ),
  );

  server.registerTool(
    'notecms_create_entry',
    {
      title: 'Create entry',
      description:
        'Creates an entry under **contentTypeId**. **data** must follow the type’s field keys and types from **notecms_list_content_types**. Slug only when the type uses slugs.',
      inputSchema: {
        siteId: siteIdOpt,
        contentTypeId: z.string(),
        name: z.string(),
        slug: z.string().optional(),
        data: z.record(z.string(), z.unknown()).describe('Field key → value map matching the content type schema'),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      graphqlTool(() =>
        executeGraphql<{ createEntry: unknown }>(apollo, ctx, M.createEntry, {
          siteId: args?.siteId ?? null,
          contentTypeId: args!.contentTypeId,
          name: args!.name,
          slug: args?.slug ?? null,
          data: args!.data,
        }),
      ),
  );

  server.registerTool(
    'notecms_update_entry',
    {
      title: 'Update entry',
      description:
        'Patches name, slug, and/or **data**. Requires **entries:write**. Merge **data** carefully with existing document shape.',
      inputSchema: {
        id: z.string().describe('Entry id'),
        siteId: siteIdOpt,
        name: z.string().optional(),
        slug: z.string().optional(),
        data: z.record(z.string(), z.unknown()).optional(),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      graphqlTool(() =>
        executeGraphql<{ updateEntry: unknown }>(apollo, ctx, M.updateEntry, {
          id: args!.id,
          siteId: args?.siteId ?? null,
          name: args?.name,
          slug: args?.slug,
          data: args?.data as Record<string, unknown> | undefined,
        }),
      ),
  );

  server.registerTool(
    'notecms_delete_entry',
    {
      title: 'Delete entry',
      description: 'Permanently deletes one entry by id. Requires **entries:write**.',
      inputSchema: { id: z.string().describe('Entry id'), siteId: siteIdOpt },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async (args) =>
      graphqlTool(
        () =>
          executeGraphql<{ deleteEntry: boolean }>(apollo, ctx, M.deleteEntry, {
            id: args!.id,
            siteId: args?.siteId ?? null,
          }),
        'Deletion is permanent for this entry document.',
      ),
  );

  server.registerTool(
    'notecms_update_site_settings',
    {
      title: 'Update site settings',
      description:
        'Updates branding, title, menu entry map, etc. Requires **site_settings:write**. Wrong menu entry ids break navigation—read current settings first.',
      inputSchema: {
        siteId: siteIdOpt,
        input: z
          .record(z.string(), z.unknown())
          .describe('SiteSettingsInput fields: siteTitle, menuEntries, logoAssetId, faviconAssetId, mcpEnabled, …'),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      graphqlTool(() =>
        executeGraphql<{ updateSiteSettings: unknown }>(apollo, ctx, M.updateSiteSettings, {
          siteId: args?.siteId ?? null,
          input: args!.input as Record<string, unknown>,
        }),
      ),
  );

  server.registerTool(
    'notecms_import_site_bundle',
    {
      title: 'Import site bundle',
      description:
        'Applies an exported bundle into the workspace. Requires **bundles:write**. Can overwrite types, entries, settings, and assets per **options**—treat as destructive on production.',
      inputSchema: {
        siteId: siteIdOpt,
        bundle: z.unknown().describe('Full bundle JSON from export_site_bundle'),
        options: z.object({
          siteSettings: z.boolean(),
          contentTypes: z.boolean(),
          contentTypeSlugsForEntries: z.array(z.string()),
          assets: z.boolean(),
        }),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async (args) =>
      graphqlTool(
        () =>
          executeGraphql<{ importSiteBundle: unknown }>(apollo, ctx, M.importBundle, {
            siteId: args?.siteId ?? null,
            bundle: args!.bundle,
            options: args!.options,
          }),
        'Import can overwrite large parts of the site. Verify siteId, bundle source, and each options flag before running.',
      ),
  );

  return server;
}
