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

type GraphqlPayload = {
  data?: unknown;
  errors?: Array<{ message?: string; extensions?: Record<string, unknown> }>;
};

function unreachableServerMessage(response: Response): string {
  if (response.status >= 500) {
    return 'The server is having trouble right now. Try again in a moment.';
  }
  if (response.status === 404) {
    return 'Could not reach the server. Check that the API is running.';
  }
  return 'Could not reach the server. Check that the API is running and try again.';
}

function httpErrorMessage(response: Response): string {
  if (response.status === 401 || response.status === 403) {
    return 'You are not signed in or do not have access.';
  }
  if (response.status >= 500) {
    return 'The server is having trouble right now. Try again in a moment.';
  }
  return 'Something went wrong. Try again.';
}

export async function gqlRequest<T>(token: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(getGraphqlEndpoint(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch {
    throw new Error('Could not connect. Check your network and that the API is running.');
  }

  const text = await response.text();
  let payload: GraphqlPayload;
  try {
    payload = text ? (JSON.parse(text) as GraphqlPayload) : {};
  } catch {
    throw new Error(unreachableServerMessage(response));
  }

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

  if (!response.ok) {
    throw new Error(httpErrorMessage(response));
  }

  return payload.data as T;
}
