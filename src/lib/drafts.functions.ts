import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DraftAttachment = {
  filename: string;
  mimeType: string;
  size: number;
  storagePath: string;
};

export type EmailDraft = {
  id: string;
  name: string;
  gmail_account_id: string | null;
  template_id: string | null;
  resume_version_id: string | null;
  recipients: string;
  subject: string;
  body: string;
  variables: Record<string, string>;
  resume_ids: string[];
  attachments: DraftAttachment[];
  company: string;
  role: string;
  job_description: string;
  instructions: string;
  metadata: Record<string, string | number | boolean | null>;
  created_at: string;
  updated_at: string;
};

// Mirrors the Gmail send limit: 25 MB per file and across all of a draft's attachments.
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_ATTACHMENT_BASE64_CHARS = Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 4;

const draftSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  name: z.string().max(200).default("Untitled draft"),
  gmailAccountId: z.string().uuid().nullable().optional(),
  templateId: z.string().uuid().nullable().optional(),
  resumeVersionId: z.string().uuid().nullable().optional(),
  recipients: z.string().max(200_000).default(""),
  subject: z.string().max(2000).default(""),
  body: z.string().max(200_000).default(""),
  variables: z.record(z.string(), z.string()).default({}),
  resumeIds: z.array(z.string().uuid()).max(50).default([]),
  attachments: z
    .array(
      z.object({
        filename: z.string().max(255),
        mimeType: z.string().max(128),
        size: z.number().int().nonnegative().max(MAX_ATTACHMENT_BYTES),
        storagePath: z.string().max(1024).optional(),
        base64: z.string().max(MAX_ATTACHMENT_BASE64_CHARS).optional(),
      }),
    )
    .max(10)
    .default([]),
  company: z.string().max(300).default(""),
  role: z.string().max(300).default(""),
  jobDescription: z.string().max(50_000).default(""),
  instructions: z.string().max(8000).default(""),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
});

const isAutosave = (d: EmailDraft) => !!(d.metadata && d.metadata.autosave === true);

export const listEmailDrafts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EmailDraft[]> => {
    const { untyped } = await import("./user-profile.server.helpers");
    const { data, error } = await untyped(context.supabase)
      .from("email_drafts")
      .select("*")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    // Named drafts only — autosave is restored separately on Send.
    return ((data ?? []) as EmailDraft[]).filter((d) => !isAutosave(d));
  });

/** Latest working autosave for the signed-in user (cross-device resume). */
export const getAutosaveDraft = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { untyped } = await import("./user-profile.server.helpers");
    const db = untyped(context.supabase);
    const { data, error } = await db
      .from("email_drafts")
      .select("*")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false })
      .limit(40);
    if (error) throw new Error(error.message);
    const draft = ((data ?? []) as EmailDraft[]).find(isAutosave) ?? null;
    if (!draft) return { draft: null, attachments: [] as Array<DraftAttachment & { url: string | null }> };

    const attachments: Array<DraftAttachment & { url: string | null }> = [];
    for (const a of draft.attachments ?? []) {
      const { data: signed } = await context.supabase.storage
        .from("draft-attachments")
        .createSignedUrl(a.storagePath, 60 * 30);
      attachments.push({ ...a, url: signed?.signedUrl ?? null });
    }
    return { draft, attachments };
  });

export const getEmailDraft = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { untyped } = await import("./user-profile.server.helpers");
    const db = untyped(context.supabase);
    const { data: row, error } = await db
      .from("email_drafts")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (error || !row) throw new Error(error?.message ?? "Draft not found");
    const draft = row as EmailDraft;
    const attachments: Array<DraftAttachment & { url: string | null }> = [];
    for (const a of draft.attachments ?? []) {
      const { data: signed } = await context.supabase.storage
        .from("draft-attachments")
        .createSignedUrl(a.storagePath, 60 * 30);
      attachments.push({ ...a, url: signed?.signedUrl ?? null });
    }
    return { draft, attachments };
  });

export const saveEmailDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => draftSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { untyped } = await import("./user-profile.server.helpers");
    const db = untyped(context.supabase);
    const draftId = data.id ?? crypto.randomUUID();

    // Decode new uploads first so size limits use real byte counts, not client-reported sizes.
    const decoded = data.attachments.map((a) => (a.base64 && !a.storagePath ? Buffer.from(a.base64, "base64") : null));
    let totalBytes = 0;
    for (const [i, a] of data.attachments.entries()) {
      if (a.storagePath && (!a.storagePath.startsWith(`${context.userId}/`) || a.storagePath.includes(".."))) {
        throw new Error(`${a.filename}: invalid storage path`);
      }
      totalBytes += decoded[i]?.length ?? a.size;
    }
    if (totalBytes > MAX_ATTACHMENT_BYTES) throw new Error("Attachments exceed 25 MB total.");

    // Persist any newly-added inline attachments to storage.
    const attachments: DraftAttachment[] = [];
    for (const [i, a] of data.attachments.entries()) {
      if (a.storagePath) {
        attachments.push({ filename: a.filename, mimeType: a.mimeType, size: a.size, storagePath: a.storagePath });
        continue;
      }
      const buf = decoded[i];
      if (!buf) continue;
      const path = `${context.userId}/${draftId}/${crypto.randomUUID()}-${a.filename.replace(/[^A-Za-z0-9._-]+/g, "_")}`;
      const up = await context.supabase.storage
        .from("draft-attachments")
        .upload(path, buf, {
          contentType: a.mimeType || "application/octet-stream",
          upsert: true,
        });
      if (up.error) throw new Error(`${a.filename}: ${up.error.message}`);
      attachments.push({ filename: a.filename, mimeType: a.mimeType, size: buf.length, storagePath: path });
    }

    const row = {
      id: draftId,
      user_id: context.userId,
      name: data.name || "Untitled draft",
      gmail_account_id: data.gmailAccountId ?? null,
      template_id: data.templateId ?? null,
      resume_version_id: data.resumeVersionId ?? null,
      recipients: data.recipients,
      subject: data.subject,
      body: data.body,
      variables: data.variables,
      resume_ids: data.resumeIds,
      attachments,
      company: data.company,
      role: data.role,
      job_description: data.jobDescription,
      instructions: data.instructions,
      metadata: data.metadata,
      updated_at: new Date().toISOString(),
    };

    const { error } = await db.from("email_drafts").upsert(row, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true, id: draftId, attachments };
  });

export const deleteEmailDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { untyped } = await import("./user-profile.server.helpers");
    const db = untyped(context.supabase);
    const { data: row } = await db
      .from("email_drafts")
      .select("attachments")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    const { error } = await db.from("email_drafts").delete().eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    const paths = ((row as { attachments?: DraftAttachment[] } | null)?.attachments ?? []).map((a) => a.storagePath);
    if (paths.length) await context.supabase.storage.from("draft-attachments").remove(paths);
    return { ok: true };
  });
