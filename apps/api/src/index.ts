import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { connectDb } from './db/mongoose.js';
import { migrateEntryNames } from './db/migrate-entry-names.js';
import { typeDefs } from './graphql/schema.js';
import { resolvers } from './resolvers/index.js';
import { env } from './config/env.js';
import { verifyApiKeyToken } from './auth/api-key.js';
import type { RequestContext } from './auth/rbac.js';
import { verifyToken } from './auth/security.js';

await connectDb();
await migrateEntryNames();

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
