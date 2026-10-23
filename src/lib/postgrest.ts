/**
 * Build a PostgREST `.or()` clause that ilike-matches `search` against each column.
 * The value is double-quoted (with `\` and `"` escaped) so commas, dots and parentheses
 * in user input are treated as literal text instead of extra filter conditions.
 */
export function ilikeAnyClause(columns: string[], search: string): string {
  const pattern = `%${search}%`.replace(/[\\"]/g, "\\$&");
  return columns.map((c) => `${c}.ilike."${pattern}"`).join(",");
}
