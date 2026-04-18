import { getGraphqlEndpoint } from '@/lib/graphql-endpoint.js';

export async function gqlRequest<T>(token: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch(getGraphqlEndpoint(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json();
  if (payload.errors?.length) throw new Error(payload.errors[0].message as string);
  return payload.data as T;
}
