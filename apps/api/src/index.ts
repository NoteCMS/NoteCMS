import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { connectDb } from './db/mongoose.js';
import { migrateEntryNames } from './db/migrate-entry-names.js';
import { typeDefs } from './graphql/schema.js';
import { resolvers } from './resolvers/index.js';
import { ensureBootstrapAdmin } from './config/bootstrap.js';
import { env } from './config/env.js';
import { verifyApiKeyToken } from './auth/api-key.js';
import type { RequestContext } from './auth/rbac.js';
import { verifyToken } from './auth/security.js';

const DEFAULT_JWT_SECRET = 'change-me';
if (env.nodeEnv === 'production' && env.jwtSecret === DEFAULT_JWT_SECRET) {
  console.error('Refusing to start: JWT_SECRET must be set to a non-default value in production.');
  process.exit(1);
}

await connectDb();
await migrateEntryNames();
await ensureBootstrapAdmin();

const server = new ApolloServer({ typeDefs, resolvers });

const { url } = await startStandaloneServer(server, {
  listen: { port: env.port },
  context: async ({ req }): Promise<RequestContext> => {
    const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '')?.trim() ?? '';
    const headerKey = typeof req.headers['x-api-key'] === 'string' ? req.headers['x-api-key'].trim() : '';
    const raw = bearer || headerKey;
    if (!raw) return {};

    const jwtPayload = verifyToken(raw);
    if (jwtPayload?.userId) return { userId: jwtPayload.userId };

    const apiKeyCtx = await verifyApiKeyToken(raw);
    if (apiKeyCtx) return { apiKey: apiKeyCtx };

    return {};
  },
});

console.log(`API ready at ${url}`);
