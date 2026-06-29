const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ParsedRecipients = {
  valid: string[];
  invalid: string[];
  duplicates: number;
  total: number;
};

/** Parse a free-form recipient string supporting commas, semicolons, newlines, spaces. */
export function parseRecipients(input: string): ParsedRecipients {
  const tokens = input
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  let duplicates = 0;

  for (const raw of tokens) {
    const t = raw.toLowerCase();
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
  }

  return { valid, invalid, duplicates, total: tokens.length };
}