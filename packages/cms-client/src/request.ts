export type GraphQLErrorPayload = {
  message: string;
  locations?: { line: number; column: number }[];
  path?: (string | number)[];
};

export type GraphQLResponse<T> = {
  data?: T;
  errors?: GraphQLErrorPayload[];
};

export type PostGraphqlOptions = {
  apiKey: string;
  fetchImpl: typeof fetch;
  /** Send key as `x-api-key` instead of `Authorization: Bearer` */
  authHeader?: 'bearer' | 'x-api-key';
  /** Extra headers merged after defaults */
  headers?: Record<string, string>;
};

export async function postGraphql<TData>(
  endpoint: string,
  body: { query: string; variables?: Record<string, unknown> },
  options: PostGraphqlOptions,
): Promise<TData> {
  const { apiKey, fetchImpl, authHeader = 'bearer', headers: extraHeaders } = options;

  const headers = new Headers();
  headers.set('content-type', 'application/json');
  if (authHeader === 'x-api-key') {
    headers.set('x-api-key', apiKey);
  } else {
    headers.set('authorization', `Bearer ${apiKey}`);
  }
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) {
      headers.set(k, v);
    }
  }

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as GraphQLResponse<TData>;

  if (!response.ok) {
    const first = payload.errors?.[0]?.message;
    throw new Error(first ?? `HTTP ${String(response.status)} ${response.statusText}`);
  }

  if (payload.errors?.length) {
    throw new Error(payload.errors[0]?.message ?? 'GraphQL error');
  }

  if (payload.data === undefined) {
    throw new Error('Empty GraphQL response');
  }

  return payload.data;
}
