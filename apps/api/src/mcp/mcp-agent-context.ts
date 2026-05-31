import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  MCP_RESOURCE_AGENT_GUIDE_URI,
  MCP_RESOURCE_API_SCOPES_URI,
  MCP_RESOURCE_FIELD_TYPES_URI,
  MCP_RESOURCE_FRONTEND_SDK_URI,
  MCP_RESOURCE_ROUTING_URI,
  MCP_RESOURCE_TOOLS_URI,
  MCP_RESOURCE_WORKFLOWS_URI,
} from './resource-uris.js';
import { AGENT_GUIDE_MARKDOWN } from './resources/agent-guide.js';
import { API_SCOPES_MARKDOWN } from './resources/api-scopes.js';
import { FIELD_TYPES_MARKDOWN } from './resources/field-types.js';
import { FRONTEND_SDK_MARKDOWN } from './resources/frontend-sdk.js';
import { ROUTING_MARKDOWN } from './resources/routing.js';
import { TOOLS_MARKDOWN } from './resources/tools.js';
import { WORKFLOWS_MARKDOWN } from './resources/workflows.js';

export {
  MCP_RESOURCE_AGENT_GUIDE_URI,
  MCP_RESOURCE_API_SCOPES_URI,
  MCP_RESOURCE_FIELD_TYPES_URI,
  MCP_RESOURCE_FRONTEND_SDK_URI,
  MCP_RESOURCE_ROUTING_URI,
  MCP_RESOURCE_TOOLS_URI,
  MCP_RESOURCE_WORKFLOWS_URI,
} from './resource-uris.js';

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

const RESOURCE_CATALOG: Array<{
  name: string;
  uri: string;
  title: string;
  description: string;
  body: string;
}> = [
  {
    name: 'agent-guide',
    uri: MCP_RESOURCE_AGENT_GUIDE_URI,
    title: 'Note CMS MCP — start here',
    description: 'Mental model, auth, lifecycle, safety. Read first in a new session.',
    body: AGENT_GUIDE_MARKDOWN,
  },
  {
    name: 'workflows',
    uri: MCP_RESOURCE_WORKFLOWS_URI,
    title: 'Note CMS — agent workflows',
    description: 'Step-by-step recipes: new page, publish, hero image, menu, sync.',
    body: WORKFLOWS_MARKDOWN,
  },
  {
    name: 'tools',
    uri: MCP_RESOURCE_TOOLS_URI,
    title: 'Note CMS MCP — tools catalog',
    description: 'Every MCP tool, arguments, and required scopes.',
    body: TOOLS_MARKDOWN,
  },
  {
    name: 'field-types',
    uri: MCP_RESOURCE_FIELD_TYPES_URI,
    title: 'Note CMS — field types',
    description: 'How to shape entry data: text, wysiwyg, image, repeater, entries picker.',
    body: FIELD_TYPES_MARKDOWN,
  },
  {
    name: 'api-scopes',
    uri: MCP_RESOURCE_API_SCOPES_URI,
    title: 'Note CMS — API key scopes',
    description: 'Scope matrix, acting user, recommended key sets, tool mapping.',
    body: API_SCOPES_MARKDOWN,
  },
  {
    name: 'frontend-sdk',
    uri: MCP_RESOURCE_FRONTEND_SDK_URI,
    title: 'Note CMS — frontend SDK',
    description: 'How to write site code with @notecms/sdk (SSR, SSG, env, security).',
    body: FRONTEND_SDK_MARKDOWN,
  },
  {
    name: 'routing',
    uri: MCP_RESOURCE_ROUTING_URI,
    title: 'Note CMS — URL routing',
    description: 'Permalinks, homepage, archives, listStaticPaths, slug rules.',
    body: ROUTING_MARKDOWN,
  },
];

/** Registers static markdown resources + a bootstrap prompt for MCP clients. */
export function registerAgentContextArtifacts(server: McpServer) {
  for (const doc of RESOURCE_CATALOG) {
    server.registerResource(
      doc.name,
      doc.uri,
      {
        title: doc.title,
        description: doc.description,
        mimeType: 'text/markdown',
      },
      async (uri) => markdownResource(uri.href, doc.body),
    );
  }

  const bootstrapBody = `You are connected to **Note CMS** over MCP (headless CMS).

**Read these resources before mutating data** (MCP \`resources/read\`):

1. \`${MCP_RESOURCE_AGENT_GUIDE_URI}\` — start here (mental model, auth, lifecycle)
2. \`${MCP_RESOURCE_WORKFLOWS_URI}\` — step-by-step recipes for common tasks
3. \`${MCP_RESOURCE_FIELD_TYPES_URI}\` — how to shape entry \`data\`
4. \`${MCP_RESOURCE_TOOLS_URI}\` — full tool catalog
5. \`${MCP_RESOURCE_API_SCOPES_URI}\` — permissions (if using an API key)
6. \`${MCP_RESOURCE_FRONTEND_SDK_URI}\` — when writing site/SSG code
7. \`${MCP_RESOURCE_ROUTING_URI}\` — URLs, slugs, homepage

**Then call tools:**
- \`notecms_api_key_info\` if using an API key (skip for JWT-only)
- \`notecms_list_content_types\` before any entry work
- Read tools before write tools

When building a frontend app, use \`@notecms/sdk\` server-side — never expose API keys to the browser.`;

  server.registerPrompt(
    'notecms_agent_bootstrap',
    {
      title: 'Note CMS — agent bootstrap',
      description:
        'Starter prompt: read built-in MCP docs (guide, workflows, field types) and api_key_info before writes.',
    },
    async () => ({
      description: 'Onboarding for Note CMS MCP agents.',
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
