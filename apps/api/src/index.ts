import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { expressMiddleware } from '@as-integrations/express5';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import cors from 'cors';
import express from 'express';
import http from 'node:http';
import { buildRequestContext } from './auth/context.js';
import type { RequestContext } from './auth/types.js';
import { connectDb } from './db/mongoose.js';
import { migrateEntryNames } from './db/migrate-entry-names.js';
import { ensureBootstrapAdmin } from './config/bootstrap.js';
import { env } from './config/env.js';
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
const httpServer = http.createServer(app);

const apollo = new ApolloServer<RequestContext>({
  typeDefs,
  resolvers,
  plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
});

await apollo.start();

app.use(
  cors<cors.CorsRequest>({
    origin: true,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key', 'mcp-session-id', 'Mcp-Session-Id'],
  }),
);
app.use(express.json({ limit: '50mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use(
  '/graphql',
  expressMiddleware(apollo, {
    context: async ({ req }) => buildRequestContext(req.headers),
  }),
);

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
      res.status(403).json({
        message: gateErr instanceof Error ? gateErr.message : 'MCP is not available for this workspace',
      });
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
      res.status(500).json({ message: err instanceof Error ? err.message : 'MCP error' });
    }
  }
}

app.get('/api/mcp', mcpHandler);
app.post('/api/mcp', mcpHandler);

app.use((_req, res) => {
  res.status(404).json({ message: 'Not found' });
});

await new Promise<void>((resolve, reject) => {
  httpServer.once('error', reject);
  httpServer.listen({ port: env.port }, () => resolve());
});

console.log(`API ready at http://localhost:${env.port}/graphql`);
console.log(`MCP (Streamable HTTP) at http://localhost:${env.port}/api/mcp`);
