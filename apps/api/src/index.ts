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
import { migrateEntryNames } from './db/migrate-entry-names.js';
import { ensureBootstrapAdmin } from './config/bootstrap.js';
import { buildCorsOptions } from './config/cors-options.js';
import { env } from './config/env.js';
import { apiSecurityHeaders } from './config/security-headers.js';
import { typeDefs } from './graphql/schema.js';
import { resolvers } from './resolvers/index.js';
import { createNoteCmsMcpServer } from './mcp/note-cms-mcp.js';
import { assertMcpEndpointEnabledForContext } from './mcp/mcp-site-gate.js';

const DEFAULT_JWT_SECRET = 'change-me';
if (env.nodeEnv === 'production' && env.jwtSecret === DEFAULT_JWT_SECRET) {
  console.error('Refusing to start: JWT_SECRET must be set to a non-default value in production.');
  process.exit(1);
}

await connectDb();
await migrateEntryNames();
await ensureBootstrapAdmin();

const app = express();
if (env.trustProxy) {
  app.set('trust proxy', 1);
}
app.use(apiSecurityHeaders());
const httpServer = http.createServer(app);

const apollo = new ApolloServer<RequestContext>({
  typeDefs,
  resolvers,
  plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
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

const mcpLimiter = rateLimit({
  windowMs: env.mcpRateLimitWindowMs,
  limit: env.mcpRateLimitMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many MCP requests; try again later.' },
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

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
