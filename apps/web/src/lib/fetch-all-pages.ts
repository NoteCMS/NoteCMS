import { gqlRequest } from '@/api/graphql';

/** Must stay ≤ API `MAX_GRAPHQL_LIST_LIMIT` (200). */
export const ADMIN_LIST_PAGE_SIZE = 200;

/**
 * Fetch every page of a GraphQL list until a short page is returned.
 * Advances offset by the actual batch length so a server-side clamp cannot skip rows.
 */
export async function fetchAllGraphqlPages<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
  pick: (data: Record<string, unknown>) => T[],
  pageSize: number = ADMIN_LIST_PAGE_SIZE,
): Promise<T[]> {
  const out: T[] = [];
  let offset = 0;
  while (true) {
    const data = await gqlRequest<Record<string, unknown>>(token, query, {
      ...variables,
      limit: pageSize,
      offset,
    });
    const batch = pick(data);
    out.push(...batch);
    if (batch.length < pageSize) break;
    offset += batch.length;
  }
  return out;
}
