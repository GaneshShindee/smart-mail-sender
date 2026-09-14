/** AI job field extraction (shared by paste, URL, RSS, ATS, Telegram). */

export async function aiExtractJobFields(text: string) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("AI gateway not configured");
  const sys =
    "You extract job information from arbitrary text (LinkedIn, Greenhouse, Lever, careers pages, emails, PDFs, Telegram posts). Return STRICT JSON with keys: title, company, location, work_mode (remote|hybrid|onsite|''), employment_type (full-time|intern|contract|part-time|''), experience, salary, description, responsibilities (string[]), skills (string[]), technologies (string[]), tags (string[]), recruiter_email, apply_url, company_website. If a field is unknown, use an empty string or empty array. Do not invent facts. No markdown, no prose.";
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: text.slice(0, 45_000) },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (res.status === 429) throw new Error("AI rate limit reached. Try again shortly.");
  if (res.status === 402) throw new Error("AI credits exhausted.");
  if (!res.ok) throw new Error(`AI error ${res.status}`);
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = j.choices?.[0]?.message?.content ?? "";
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("AI returned invalid JSON");
  const parsed = JSON.parse(m[0]) as Record<string, unknown>;
  const asStr = (k: string) => (typeof parsed[k] === "string" ? (parsed[k] as string) : "");
  const asArr = (k: string) =>
    Array.isArray(parsed[k]) ? ((parsed[k] as unknown[]).filter((x) => typeof x === "string") as string[]) : [];
  return {
    title: asStr("title"),
    company: asStr("company"),
    location: asStr("location"),
    work_mode: asStr("work_mode"),
    employment_type: asStr("employment_type"),
    experience: asStr("experience"),
    salary: asStr("salary"),
    description: asStr("description"),
    responsibilities: asArr("responsibilities"),
    skills: asArr("skills"),
    technologies: asArr("technologies"),
    tags: asArr("tags"),
    recruiter_email: asStr("recruiter_email"),
    apply_url: asStr("apply_url"),
    company_website: asStr("company_website"),
  };
}

export type ParsedJobFields = Awaited<ReturnType<typeof aiExtractJobFields>>;

export function normalizeHttpUrl(raw: string): string {
  const t = raw.trim();
  if (!t) throw new Error("URL is required");
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}
