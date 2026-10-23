import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CallFollowupStatus = "pending" | "done" | "canceled";

export type CallFollowup = {
  id: string;
  user_id: string;
  job_id: string | null;
  phone: string;
  contact_name: string;
  company: string;
  role: string;
  notes: string;
  due_at: string;
  status: CallFollowupStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

const statusEnum = z.enum(["pending", "done", "canceled"]);

export const listCallFollowups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ status: statusEnum.optional() }).parse(d ?? {}))
  .handler(async ({ data, context }): Promise<CallFollowup[]> => {
    let q = context.supabase
      .from("call_followups")
      .select("*")
      .eq("user_id", context.userId)
      // Pending: soonest deadline first. Done/canceled: most recent first.
      .order("due_at", { ascending: data.status === "pending" || !data.status })
      .limit(500);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as CallFollowup[];
  });

export const createCallFollowup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        jobId: z.string().uuid().optional().nullable(),
        phone: z.string().trim().min(3, "Phone number is required").max(40),
        contactName: z.string().trim().max(200).default(""),
        company: z.string().trim().max(200).default(""),
        role: z.string().trim().max(200).default(""),
        notes: z.string().max(5_000).default(""),
        dueAt: z.string().datetime({ offset: true }),
        /** Also save the number onto the job (only applies to the caller's own job). */
        savePhoneToJob: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("call_followups")
      .insert({
        user_id: context.userId,
        job_id: data.jobId ?? null,
        phone: data.phone,
        contact_name: data.contactName,
        company: data.company,
        role: data.role,
        notes: data.notes,
        due_at: data.dueAt,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    if (data.savePhoneToJob && data.jobId) {
      await context.supabase
        .from("jobs")
        .update({ recruiter_phone: data.phone })
        .eq("id", data.jobId)
        .eq("user_id", context.userId);
    }
    return row as CallFollowup;
  });

export const updateCallFollowup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: statusEnum.optional(),
        dueAt: z.string().datetime({ offset: true }).optional(),
        notes: z.string().max(5_000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: {
      updated_at: string;
      status?: CallFollowupStatus;
      completed_at?: string | null;
      due_at?: string;
      notes?: string;
    } = { updated_at: new Date().toISOString() };
    if (data.status) {
      patch.status = data.status;
      patch.completed_at = data.status === "pending" ? null : new Date().toISOString();
    }
    if (data.dueAt) patch.due_at = data.dueAt;
    if (data.notes !== undefined) patch.notes = data.notes;
    const { error } = await context.supabase
      .from("call_followups")
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCallFollowup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("call_followups")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
