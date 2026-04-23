import { getGraphqlEndpoint } from '@/lib/graphql-endpoint.js';

/** GraphQL `BAD_USER_INPUT` with `extensions.fieldPath` (e.g. entry validation). */
export class GraphqlUserInputError extends Error {
  readonly fieldPath: string[];

  constructor(message: string, fieldPath: string[]) {
    super(message);
    this.name = 'GraphqlUserInputError';
    this.fieldPath = fieldPath;
  }
}

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
  if (payload.errors?.length) {
    const first = payload.errors[0] as { message?: string; extensions?: Record<string, unknown> };
    const msg = String(first.message ?? 'Request failed');
    const ex = first.extensions;
    const fp = ex?.fieldPath;
    if (
      ex?.code === 'BAD_USER_INPUT' &&
      Array.isArray(fp) &&
      fp.length > 0 &&
      fp.every((x: unknown) => typeof x === 'string')
    ) {
      throw new GraphqlUserInputError(msg, fp as string[]);
    }
    throw new Error(msg);
  }
  return payload.data as T;
}
