/** Commas outside double quotes separate addresses in a header like `"Doe, Jane" <j@x.com>, b@y.com`. */
const ADDRESS_SPLIT = /,(?=(?:[^"]*"[^"]*")*[^"]*$)/;

/** Parse the first address of a From/To header for display; `display` gets " +N" when there are more. */
export function parseAddress(value: string): { name: string; email: string; display: string } {
  const parts = (value ?? "")
    .split(ADDRESS_SPLIT)
    .map((p) => p.trim())
    .filter(Boolean);
  const first = parts[0] ?? "";
  const m = first.match(/^"?([^"<]*?)"?\s*<([^>]+)>$/);
  const name = m ? m[1].trim() : "";
  const email = m ? m[2].trim() : first;
  const more = parts.length > 1 ? ` +${parts.length - 1}` : "";
  return { name, email, display: (name || email) + more };
}
