const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ParsedRecipients = {
  valid: string[];
  invalid: string[];
  duplicates: number;
  total: number;
  meta: Array<{ email: string; name?: string }>;
};

/** Parse a free-form recipient string.
 * Supports plain emails, "Name <email>", "Name email", and separators (comma/semicolon/newline).
 */
export function parseRecipients(input: string): ParsedRecipients {
  // Split by comma/semicolon/newline first (keep spaces so we can parse "Name <email>").
  const chunks = input
    .split(/[,;\n\r]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  const meta: Array<{ email: string; name?: string }> = [];
  let duplicates = 0;

  for (const raw of chunks) {
    // Extract email + optional display name from a chunk.
    let email: string | null = null;
    let name: string | undefined;

    const angle = raw.match(/^\s*(.*?)\s*<\s*([^>\s]+)\s*>\s*$/);
    if (angle) {
      name = angle[1].replace(/^["']|["']$/g, "").trim() || undefined;
      email = angle[2];
    } else {
      // Look for the last email-like token in the chunk.
      const parts = raw.split(/\s+/).filter(Boolean);
      for (let i = parts.length - 1; i >= 0; i--) {
        if (EMAIL_RE.test(parts[i])) {
          email = parts[i];
          const before = parts.slice(0, i).join(" ").trim();
          if (before) name = before.replace(/^["']|["']$/g, "").trim();
          break;
        }
      }
    }
    if (!email) {
      invalid.push(raw);
      continue;
    }
    const t = email.toLowerCase();
    if (!EMAIL_RE.test(t)) {
      invalid.push(raw);
      continue;
    }
    if (seen.has(t)) {
      duplicates += 1;
      continue;
    }
    seen.add(t);
    valid.push(t);
    meta.push({ email: t, name });
  }

  return { valid, invalid, duplicates, total: chunks.length, meta };
}

/** Derive first/last/full name from a display name or (fallback) email local part. */
export function deriveNames(email: string, displayName?: string | null): {
  first_name: string;
  last_name: string;
  full_name: string;
} {
  const clean = (s: string) =>
    s
      .replace(/[._\-+]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const cap = (w: string) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : "");

  let source = (displayName ?? "").trim();
  if (!source) {
    const local = email.split("@")[0] ?? "";
    // Strip trailing digits like "john.doe22".
    source = clean(local.replace(/\d+$/, ""));
  } else {
    source = clean(source);
  }
  const parts = source.split(" ").filter(Boolean).map(cap);
  const first = parts[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  const full = parts.join(" ") || first || "";
  return { first_name: first, last_name: last, full_name: full };
}