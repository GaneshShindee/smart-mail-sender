import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("templates")
      .select("id, name, subject, body, preferred_resume_id, created_at, updated_at")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(1).max(120),
  subject: z.string().max(998).default(""),
  body: z.string().max(100_000).default(""),
  preferredResumeId: z.string().uuid().nullable().optional(),
});

export const upsertTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("templates")
        .update({ name: data.name, subject: data.subject, body: data.body, preferred_resume_id: data.preferredResumeId ?? null })
        .eq("id", data.id)
        .eq("user_id", context.userId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return row;
    } else {
      const { data: row, error } = await context.supabase
        .from("templates")
        .insert({ user_id: context.userId, name: data.name, subject: data.subject, body: data.body, preferred_resume_id: data.preferredResumeId ?? null })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return row;
    }
  });

export const deleteTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("templates")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const duplicateTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: src, error: e1 } = await context.supabase
      .from("templates")
      .select("name, subject, body")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (e1 || !src) throw new Error(e1?.message ?? "Template not found");
    const { data: row, error } = await context.supabase
      .from("templates")
      .insert({ user_id: context.userId, name: `${src.name} (copy)`, subject: src.subject, body: src.body })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });