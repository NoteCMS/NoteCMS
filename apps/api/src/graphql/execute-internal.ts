import type { ApolloServer } from '@apollo/server';
import type { RequestContext } from '../auth/types.js';

export async function executeGraphql<TData>(
  apollo: ApolloServer<RequestContext>,
  contextValue: RequestContext,
  query: string,
  variables?: Record<string, unknown>,
): Promise<TData> {
  const response = await apollo.executeOperation({ query, variables }, { contextValue });
  if (response.body.kind !== 'single') {
    throw new Error('Unexpected GraphQL response');
  }
  const { data, errors } = response.body.singleResult;
  if (errors?.length) {
    throw new Error(errors.map((e) => e.message).join('; '));
  }
  if (data == null) {
    throw new Error('Empty GraphQL data');
  }
  return data as TData;
}
