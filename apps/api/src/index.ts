import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { expressMiddleware } from '@as-integrations/express5';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import http from 'node:http';
import { buildRequestContext } from './auth/context.js';
import type { RequestContext } from './auth/types.js';
import { connectDb } from './db/mongoose.js';
import { migrateEntryLifecycle } from './db/migrate-entry-lifecycle.js';
import { migrateEntryNames } from './db/migrate-entry-names.js';
import { migrateMembershipRoles } from './db/migrate-membership-roles.js';
import { migrateMetaTaxonomy } from './db/migrate-meta-taxonomy.js';
import { ensureBootstrapAdmin } from './config/bootstrap.js';
import { buildCorsOptions } from './config/cors-options.js';
import { env } from './config/env.js';
import { apiSecurityHeaders } from './config/security-headers.js';
import { createMcpLimiter } from './config/mcp-rate-limit.js';
import { typeDefs } from './graphql/schema.js';
import { resolvers } from './resolvers/index.js';
import { createNoteCmsMcpServer } from './mcp/note-cms-mcp.js';
import { assertMcpEndpointEnabledForContext } from './mcp/mcp-site-gate.js';
import { siteBuildCallbackHandler } from './http/site-build-callback.js';
import { SITE_BUILD_HOOK_BASE, SITE_BUILD_HOOK_LEGACY_BASE } from './http/site-build-hook-paths.js';
import { startBackupScheduler } from './backups/scheduler.js';
import { getPlatformMaintenanceMode } from './db/models/PlatformState.js';

const DEFAULT_JWT_SECRET = 'change-me';
if (env.nodeEnv === 'production' && env.jwtSecret === DEFAULT_JWT_SECRET) {
  console.error('Refusing to start: JWT_SECRET must be set to a non-default value in production.');
  process.exit(1);
}

await connectDb();
await migrateEntryNames();
await migrateEntryLifecycle();
await migrateMembershipRoles();
await migrateMetaTaxonomy();
await ensureBootstrapAdmin();
startBackupScheduler();

const app = express();
if (env.trustProxy) {
  app.set('trust proxy', 1);
}
app.use(apiSecurityHeaders());
const httpServer = http.createServer(app);

const apollo = new ApolloServer<RequestContext>({
  typeDefs,
  resolvers,
  plugins: [
    ApolloServerPluginDrainHttpServer({ httpServer }),
    {
      async requestDidStart() {
        return {
          async didResolveOperation(ctx) {
            if (ctx.operation?.operation !== 'mutation') return;
            if (await getPlatformMaintenanceMode()) {
              throw new Error('Platform is in maintenance mode; try again after restore completes.');
            }
          },
        };
      },
    },
  ],
});

await apollo.start();

app.use(cors<cors.CorsRequest>(buildCorsOptions()));
app.use(express.json({ limit: env.jsonBodyLimit }));

const graphqlLimiter = rateLimit({
  windowMs: env.graphqlRateLimitWindowMs,
  limit: env.graphqlRateLimitMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many requests; try again later.' },
});

const mcpLimiter = createMcpLimiter();

const hooksLimiter = rateLimit({
  windowMs: env.hooksRateLimitWindowMs,
  limit: env.hooksRateLimitMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many requests; try again later.' },
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

const siteBuildHookMethodNotAllowed = (_req: express.Request, res: express.Response) => {
  res
    .status(405)
    .setHeader('Allow', 'POST')
    .json({
      message:
        'Build completion callbacks must be POST requests with JSON {"status":"success"|"failure"|"cancelled"} and a valid token.',
    });
};

function registerSiteBuildHookRoutes(basePath: string) {
  app.post(`${basePath}/:siteId/:buildSlug`, hooksLimiter, async (req, res) => {
    try {
      const buildSlug = typeof req.params.buildSlug === 'string' ? req.params.buildSlug : undefined;
      await siteBuildCallbackHandler(req, res, buildSlug);
    } catch (err) {
      if (!res.headersSent) {
        console.error('[hooks/site-build]', err);
        res.status(500).json({ message: env.nodeEnv === 'production' ? 'Internal server error' : 'Callback failed' });
      }
    }
  });

  app.post(`${basePath}/:siteId`, hooksLimiter, async (req, res) => {
    try {
      await siteBuildCallbackHandler(req, res);
    } catch (err) {
      if (!res.headersSent) {
        console.error('[hooks/site-build]', err);
        res.status(500).json({ message: env.nodeEnv === 'production' ? 'Internal server error' : 'Callback failed' });
      }
    }
  });

  app.get(`${basePath}/:siteId/:buildSlug`, hooksLimiter, siteBuildHookMethodNotAllowed);
  app.get(`${basePath}/:siteId`, hooksLimiter, siteBuildHookMethodNotAllowed);
}

registerSiteBuildHookRoutes(SITE_BUILD_HOOK_BASE);
registerSiteBuildHookRoutes(SITE_BUILD_HOOK_LEGACY_BASE);

app.use(
  '/graphql',
  graphqlLimiter,
  expressMiddleware(apollo, {
    context: async ({ req }) => buildRequestContext(req.headers),
  }),
);

function mcpSafeErrorMessage(err: unknown): string {
  if (env.nodeEnv === 'production') return 'Internal server error';
  return err instanceof Error ? err.message : 'MCP error';
}

async function mcpHandler(req: express.Request, res: express.Response) {
  try {
    const ctx = await buildRequestContext(req.headers);
    if (!ctx.apiKey && !ctx.userId) {
      res.status(401).json({
        message: 'Unauthorized: use Authorization: Bearer (JWT or site API key) or x-api-key header',
      });
      return;
    }
    try {
      await assertMcpEndpointEnabledForContext(ctx);
    } catch (gateErr) {
      const message =
        env.nodeEnv === 'production'
          ? 'Forbidden'
          : gateErr instanceof Error
            ? gateErr.message
            : 'MCP is not available for this workspace';
      res.status(403).json({ message });
      return;
    }
    const mcp = createNoteCmsMcpServer(apollo, ctx);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await mcp.connect(transport);
    try {
      await transport.handleRequest(
        req as Parameters<StreamableHTTPServerTransport['handleRequest']>[0],
        res,
        req.body,
      );
    } finally {
      await mcp.close();
    }
  } catch (err) {
    if (!res.headersSent) {
      console.error('[mcp]', err);
      res.status(500).json({ message: mcpSafeErrorMessage(err) });
    }
  }
}

app.get('/api/mcp', mcpLimiter, mcpHandler);
app.post('/api/mcp', mcpLimiter, mcpHandler);

app.use((_req, res) => {
  res.status(404).json({ message: 'Not found' });
});

await new Promise<void>((resolve, reject) => {
  httpServer.once('error', reject);
  httpServer.listen({ port: env.port }, () => resolve());
});

console.log(`API ready at http://localhost:${env.port}/graphql`);
console.log(`MCP (Streamable HTTP) at http://localhost:${env.port}/api/mcp`);
