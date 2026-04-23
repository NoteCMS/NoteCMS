/** Escape a user-supplied string for safe use inside a MongoDB `$regex` pattern. */
export function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
