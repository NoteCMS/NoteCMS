import type { ApolloServer } from '@apollo/server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { RequestContext } from '../auth/types.js';
import { executeGraphql } from '../graphql/execute-internal.js';

const siteIdOpt = z.string().optional().describe('Workspace id; omit when using a site API key');

function jsonResult(payload: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
  };
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
  const server = new McpServer({ name: 'note-cms', version: '1.0.0' });

  server.registerTool(
    'notecms_api_key_info',
    {
      description: 'Returns site id and scopes for the current API key (fails with JWT-only auth).',
    },
    async () => {
      const data = await executeGraphql<{ apiKeyInfo: unknown }>(apollo, ctx, Q.apiKeyInfo);
      return jsonResult(data);
    },
  );

  server.registerTool(
    'notecms_list_content_types',
    {
      description: 'List content types for the workspace.',
      inputSchema: { siteId: siteIdOpt },
    },
    async (args) => {
      const data = await executeGraphql<{ contentTypes: unknown[] }>(apollo, ctx, Q.contentTypes, {
        siteId: args?.siteId ?? null,
      });
      return jsonResult(data);
    },
  );

  server.registerTool(
    'notecms_list_entries',
    {
      description: 'List entries for a content type (newest first).',
      inputSchema: {
        siteId: siteIdOpt,
        contentTypeId: z.string().describe('Content type id'),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    async (args) => {
      const data = await executeGraphql<{ entries: unknown[] }>(apollo, ctx, Q.entries, {
        siteId: args?.siteId ?? null,
        contentTypeId: args!.contentTypeId,
        limit: args?.limit ?? 30,
        offset: args?.offset ?? 0,
      });
      return jsonResult(data);
    },
  );

  server.registerTool(
    'notecms_get_entry',
    {
      description: 'Get a single entry by id.',
      inputSchema: {
        siteId: siteIdOpt,
        id: z.string(),
      },
    },
    async (args) => {
      const data = await executeGraphql<{ entry: unknown }>(apollo, ctx, Q.entry, {
        siteId: args?.siteId ?? null,
        id: args!.id,
      });
      return jsonResult(data);
    },
  );

  server.registerTool(
    'notecms_get_entry_by_slug',
    {
      description: 'Get entry by content type slug and entry slug.',
      inputSchema: {
        siteId: siteIdOpt,
        contentTypeSlug: z.string(),
        slug: z.string(),
      },
    },
    async (args) => {
      const data = await executeGraphql<{ entryBySlug: unknown }>(apollo, ctx, Q.entryBySlug, {
        siteId: args?.siteId ?? null,
        contentTypeSlug: args!.contentTypeSlug,
        slug: args!.slug,
      });
      return jsonResult(data);
    },
  );

  server.registerTool(
    'notecms_list_assets',
    {
      description: 'List assets (optional search on filename).',
      inputSchema: {
        siteId: siteIdOpt,
        query: z.string().optional(),
        limit: z.number().int().optional(),
        offset: z.number().int().optional(),
      },
    },
    async (args) => {
      const data = await executeGraphql<{ listAssets: unknown[] }>(apollo, ctx, Q.listAssets, {
        siteId: args?.siteId ?? null,
        query: args?.query ?? '',
        limit: args?.limit ?? 30,
        offset: args?.offset ?? 0,
      });
      return jsonResult(data);
    },
  );

  server.registerTool(
    'notecms_get_site_settings',
    {
      description: 'Site title, menu entry ids, branding asset ids.',
      inputSchema: { siteId: siteIdOpt },
    },
    async (args) => {
      const data = await executeGraphql<{ siteSettings: unknown }>(apollo, ctx, Q.siteSettings, {
        siteId: args?.siteId ?? null,
      });
      return jsonResult(data);
    },
  );

  server.registerTool(
    'notecms_export_site_bundle',
    {
      description: 'Export site bundle JSON (requires bundles:read on API key, or admin JWT).',
      inputSchema: {
        siteId: siteIdOpt,
        siteSettings: z.boolean(),
        contentTypes: z.boolean(),
        contentTypeSlugsForEntries: z.array(z.string()),
        assets: z.boolean(),
      },
    },
    async (args) => {
      const data = await executeGraphql<{ exportSiteBundle: unknown }>(apollo, ctx, Q.exportBundle, {
        siteId: args?.siteId ?? null,
        options: {
          siteSettings: args!.siteSettings,
          contentTypes: args!.contentTypes,
          contentTypeSlugsForEntries: args!.contentTypeSlugsForEntries,
          assets: args!.assets,
        },
      });
      return jsonResult(data);
    },
  );

  server.registerTool(
    'notecms_create_content_type',
    {
      description: 'Create a content type (admin / content_types:write).',
      inputSchema: {
        siteId: siteIdOpt,
        name: z.string(),
        slug: z.string(),
        fields: z.array(z.unknown()).describe('Field definitions: [{ key, label, type, … }]'),
        options: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async (args) => {
      const data = await executeGraphql<{ createContentType: unknown }>(apollo, ctx, M.createContentType, {
        siteId: args?.siteId ?? null,
        name: args!.name,
        slug: args!.slug,
        fields: args!.fields as Record<string, unknown>[],
        options: args?.options ?? {},
      });
      return jsonResult(data);
    },
  );

  server.registerTool(
    'notecms_update_content_type',
    {
      description: 'Update a content type.',
      inputSchema: {
        id: z.string(),
        siteId: siteIdOpt,
        name: z.string().optional(),
        slug: z.string().optional(),
        fields: z.array(z.unknown()).optional(),
        options: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async (args) => {
      const data = await executeGraphql<{ updateContentType: unknown }>(apollo, ctx, M.updateContentType, {
        id: args!.id,
        siteId: args?.siteId ?? null,
        name: args?.name,
        slug: args?.slug,
        fields: args?.fields as Record<string, unknown>[] | undefined,
        options: args?.options,
      });
      return jsonResult(data);
    },
  );

  server.registerTool(
    'notecms_delete_content_type',
    {
      description: 'Delete a content type.',
      inputSchema: { id: z.string(), siteId: siteIdOpt },
    },
    async (args) => {
      const data = await executeGraphql<{ deleteContentType: boolean }>(apollo, ctx, M.deleteContentType, {
        id: args!.id,
        siteId: args?.siteId ?? null,
      });
      return jsonResult(data);
    },
  );

  server.registerTool(
    'notecms_create_entry',
    {
      description: 'Create an entry.',
      inputSchema: {
        siteId: siteIdOpt,
        contentTypeId: z.string(),
        name: z.string(),
        slug: z.string().optional(),
        data: z.record(z.string(), z.unknown()),
      },
    },
    async (args) => {
      const data = await executeGraphql<{ createEntry: unknown }>(apollo, ctx, M.createEntry, {
        siteId: args?.siteId ?? null,
        contentTypeId: args!.contentTypeId,
        name: args!.name,
        slug: args?.slug ?? null,
        data: args!.data,
      });
      return jsonResult(data);
    },
  );

  server.registerTool(
    'notecms_update_entry',
    {
      description: 'Update an entry.',
      inputSchema: {
        id: z.string(),
        siteId: siteIdOpt,
        name: z.string().optional(),
        slug: z.string().optional(),
        data: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async (args) => {
      const data = await executeGraphql<{ updateEntry: unknown }>(apollo, ctx, M.updateEntry, {
        id: args!.id,
        siteId: args?.siteId ?? null,
        name: args?.name,
        slug: args?.slug,
        data: args?.data as Record<string, unknown> | undefined,
      });
      return jsonResult(data);
    },
  );

  server.registerTool(
    'notecms_delete_entry',
    {
      description: 'Delete an entry.',
      inputSchema: { id: z.string(), siteId: siteIdOpt },
    },
    async (args) => {
      const data = await executeGraphql<{ deleteEntry: boolean }>(apollo, ctx, M.deleteEntry, {
        id: args!.id,
        siteId: args?.siteId ?? null,
      });
      return jsonResult(data);
    },
  );

  server.registerTool(
    'notecms_update_site_settings',
    {
      description: 'Update site settings (logo, favicon, title, menu entries map).',
      inputSchema: {
        siteId: siteIdOpt,
        input: z.record(z.string(), z.unknown()),
      },
    },
    async (args) => {
      const data = await executeGraphql<{ updateSiteSettings: unknown }>(apollo, ctx, M.updateSiteSettings, {
        siteId: args?.siteId ?? null,
        input: args!.input as Record<string, unknown>,
      });
      return jsonResult(data);
    },
  );

  server.registerTool(
    'notecms_import_site_bundle',
    {
      description: 'Import a site bundle (admin / bundles:write).',
      inputSchema: {
        siteId: siteIdOpt,
        bundle: z.unknown(),
        options: z.object({
          siteSettings: z.boolean(),
          contentTypes: z.boolean(),
          contentTypeSlugsForEntries: z.array(z.string()),
          assets: z.boolean(),
        }),
      },
    },
    async (args) => {
      const data = await executeGraphql<{ importSiteBundle: unknown }>(apollo, ctx, M.importBundle, {
        siteId: args?.siteId ?? null,
        bundle: args!.bundle,
        options: args!.options,
      });
      return jsonResult(data);
    },
  );

  return server;
}
