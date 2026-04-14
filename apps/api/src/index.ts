import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { connectDb } from './db/mongoose.js';
import { typeDefs } from './graphql/schema.js';
import { resolvers } from './resolvers/index.js';
import { env } from './config/env.js';
import { verifyToken } from './auth/security.js';

await connectDb();

const server = new ApolloServer({ typeDefs, resolvers });

const { url } = await startStandaloneServer(server, {
  listen: { port: env.port },
  context: async ({ req }) => {
    const auth = req.headers.authorization?.replace('Bearer ', '');
    const token = auth ? verifyToken(auth) : null;
    return { userId: token?.userId };
  },
});

console.log(`API ready at ${url}`);
