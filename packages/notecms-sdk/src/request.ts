import { NoteCmsError } from './errors.js';

export type GraphQLErrorPayload = {
  message: string;
  locations?: { line: number; column: number }[];
  path?: (string | number)[];
  extensions?: Record<string, unknown>;
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
  /** Extra headers merged before Content-Type and auth (lower precedence). */
  headers?: Record<string, string>;
  /**
   * Merged into the underlying `fetch` call (e.g. `{ cache: 'no-store' }` in dev).
   * `method`, `headers`, and `body` are always set by the SDK after merge so the request is a valid GraphQL POST.
   */
  fetchInit?: RequestInit;
};

function mergeHeaders(base: HeadersInit | undefined, authHeaders: Headers): Headers {
  const out = new Headers(base);
  authHeaders.forEach((value, key) => {
    out.set(key, value);
  });
  return out;
}

export async function postGraphql<TData>(
  endpoint: string,
  body: { query: string; variables?: Record<string, unknown> },
  options: PostGraphqlOptions,
): Promise<TData> {
  const { apiKey, fetchImpl, authHeader = 'bearer', headers: extraHeaders, fetchInit } = options;

  const auth = new Headers();
  auth.set('content-type', 'application/json');
  if (authHeader === 'x-api-key') {
    auth.set('x-api-key', apiKey);
  } else {
    auth.set('authorization', `Bearer ${apiKey}`);
  }
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) {
      auth.set(k, v);
    }
  }

  const merged = mergeHeaders(fetchInit?.headers, auth);

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      ...fetchInit,
      method: 'POST',
      headers: merged,
      body: JSON.stringify(body),
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Network error';
    throw new NoteCmsError(`NoteCMS request failed: ${message}`, { status: 0, errors: [] });
  }

  let payload: GraphQLResponse<TData>;
  try {
    payload = (await response.json()) as GraphQLResponse<TData>;
  } catch {
    throw new NoteCmsError('GraphQL endpoint returned non-JSON body', {
      status: response.status,
      errors: [],
    });
  }

  if (!response.ok) {
    const first = payload.errors?.[0];
    throw new NoteCmsError(first?.message ?? `HTTP ${String(response.status)} ${response.statusText}`, {
      status: response.status,
      errors: payload.errors ?? [],
    });
  }

  if (payload.errors?.length) {
    const first = payload.errors[0];
    throw new NoteCmsError(first?.message ?? 'GraphQL error', {
      status: response.status,
      errors: payload.errors,
    });
  }

  if (payload.data === undefined) {
    throw new NoteCmsError('Empty GraphQL response', { status: response.status, errors: [] });
  }

  return payload.data;
}
