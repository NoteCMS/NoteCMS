/** Upper bound for GraphQL list queries that accept limit/offset (DoS / memory). */
export const MAX_GRAPHQL_LIST_LIMIT = 100;
export const MAX_GRAPHQL_LIST_OFFSET = 50_000;

export function clampListArgs(
  limit: unknown,
  offset: unknown,
  defaults: { limit?: number; offset?: number } = {},
): { limit: number; offset: number } {
  const defLimit = defaults.limit ?? 30;
  const defOffset = defaults.offset ?? 0;
  const rawL = typeof limit === 'number' && Number.isFinite(limit) ? Math.floor(limit) : defLimit;
  const rawO = typeof offset === 'number' && Number.isFinite(offset) ? Math.floor(offset) : defOffset;
  return {
    limit: Math.min(MAX_GRAPHQL_LIST_LIMIT, Math.max(1, rawL)),
    offset: Math.min(MAX_GRAPHQL_LIST_OFFSET, Math.max(0, rawO)),
  };
}
