import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Sb = any;
const uuid = z.string().uuid();

const STATUS = z.enum([
  "submitted",
  "under_review",
  "assigned",
  "investigation",
  "resolved",
  "rejected",
  "closed",
]);

const SELECT =
  "id, complaint_code, product_name, manufacturer_name, barcode, description, status, priority, category, " +
  "latitude, longitude, region, image_path, created_at, updated_at, assigned_to, assigned_at, authority_id, " +
  "inspection_id, resolution_note, product_id";

async function rolesOf(supabase: Sb, userId: string): Promise<string[]> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return ((data ?? []) as { role: string }[]).map((r) => r.role);
}

async function withEvidence(supabase: Sb, rows: Record<string, any>[]) {
  const out: Record<string, any>[] = [];
  for (const row of rows) {
    let url: string | null = null;
    if (row["image_path"]) {
      const { data } = await supabase.storage
        .from("complaint-evidence")
        .createSignedUrl(row["image_path"] as string, 60 * 30);
      url = (data?.signedUrl as string | undefined) ?? null;
    }
    out.push({ ...row, evidence_url: url });
  }
  return out;
}

/** Adds a tracked progress entry that the citizen can follow. */
async function trackStep(
  supabase: Sb,
  userId: string,
  complaintId: string,
  status: string | null,
  note: string,
  isPublic = true,
) {
  await supabase.from("complaint_updates").insert({
    complaint_id: complaintId,
    actor_id: userId,
    status: status as never,
    note,
    is_public: isPublic,
  });
}

/**
 * Complaints an inspector can act on: unclaimed ones inside their authority
 * plus everything already assigned to them.
 */
export const inspectorComplaintQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const roles = await rolesOf(supabase, userId);
    if (!roles.includes("inspector")) return { mine: [], open: [] as Record<string, any>[] };

    const { data } = await supabase
      .from("complaints")
      .select(SELECT)
      .in("status", ["submitted", "under_review", "assigned", "investigation"])
      .order("created_at", { ascending: false })
      .limit(60);

    const rows = (data ?? []) as Record<string, any>[];
    const mine = rows.filter((r) => r["assigned_to"] === userId);
    const open = rows.filter((r) => !r["assigned_to"]);
    return {
      mine: await withEvidence(supabase, mine),
      open: await withEvidence(supabase, open.slice(0, 25)),
    };
  });

/** Full authority view with assignment state, for admins and supervisors. */
export const authorityComplaintQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const roles = await rolesOf(supabase, userId);
    if (!roles.some((r) => ["supervisor", "authority_admin", "system_admin"].includes(r)))
      return { complaints: [] as Record<string, any>[], inspectors: [] as Record<string, any>[] };

    const { data } = await supabase
      .from("complaints")
      .select(SELECT)
      .order("created_at", { ascending: false })
      .limit(100);

    const { data: authority } = await supabase.rpc("my_authority_id");
    let inspectors: Record<string, any>[] = [];
    if (authority) {
      const { data: members } = await supabase
        .from("authority_members")
        .select("user_id, member_role")
        .eq("authority_id", authority)
        .eq("is_active", true);
      const ids = ((members ?? []) as { user_id: string; member_role: string }[])
        .filter((m) => m.member_role === "inspector")
        .map((m) => m.user_id);
      if (ids.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", ids);
        inspectors = (profiles ?? []) as Record<string, any>[];
      }
    }
    return { complaints: (data ?? []) as Record<string, any>[], inspectors };
  });

/** An inspector claims an open complaint. */
export const acceptComplaint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ complaintId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { auditLog } = await import("./engine.server");
    const { notify } = await import("./notify.server");

    const { data: complaint } = await supabase
      .from("complaints")
      .select("id, complaint_code, assigned_to, complainant_id, authority_id")
      .eq("id", data.complaintId)
      .maybeSingle();
    if (!complaint) throw new Error("That complaint could not be found.");
    if (complaint.assigned_to && complaint.assigned_to !== userId)
      throw new Error("Another inspector has already accepted this complaint.");

    const { data: member } = await supabase
      .from("authority_members")
      .select("authority_id, office_id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();

    const { data: updated, error } = await supabase
      .from("complaints")
      .update({
        assigned_to: userId,
        assigned_at: new Date().toISOString(),
        status: "assigned",
        ...(complaint.authority_id ? {} : { authority_id: member?.authority_id ?? null }),
        ...(member?.office_id ? { office_id: member.office_id } : {}),
      })
      .eq("id", data.complaintId)
      .select("id");
    if (error || !updated?.length) throw new Error("The complaint could not be accepted.");

    await trackStep(supabase, userId, data.complaintId, "assigned", "An inspector accepted this complaint.");
    await auditLog(supabase as never, userId, "complaint.accepted", "complaint", data.complaintId, {
      new_value: { assigned_to: userId },
    });
    if (complaint.complainant_id) {
      await notify(complaint.complainant_id as string, {
        kind: "complaint_update",
        title: `Complaint accepted — ${complaint.complaint_code}`,
        body: "An inspector has accepted your complaint and will examine the package.",
        link: "/complaints",
        entity: "complaint",
        entityId: data.complaintId,
      });
    }
    return { ok: true as const };
  });

/** Authority staff hand a complaint to a named inspector. */
export const assignComplaint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ complaintId: uuid, inspectorId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { auditLog } = await import("./engine.server");
    const { notify } = await import("./notify.server");

    const { data: updated, error } = await supabase
      .from("complaints")
      .update({
        assigned_to: data.inspectorId,
        assigned_at: new Date().toISOString(),
        status: "assigned",
      })
      .eq("id", data.complaintId)
      .select("id, complaint_code, complainant_id");
    if (error || !updated?.length) throw new Error("The complaint could not be assigned.");

    await trackStep(supabase, userId, data.complaintId, "assigned", "The complaint was assigned to an inspector.");
    await auditLog(supabase as never, userId, "complaint.assigned", "complaint", data.complaintId, {
      new_value: { assigned_to: data.inspectorId },
    });
    await notify(data.inspectorId, {
      kind: "complaint_update",
      title: `Complaint assigned — ${updated[0]["complaint_code"]}`,
      body: "A complaint has been assigned to you for inspection.",
      link: "/inspector",
      entity: "complaint",
      entityId: data.complaintId,
    });
    return { ok: true as const };
  });

/** Records a status change with a tracked, citizen-visible progress entry. */
export const updateComplaintStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        complaintId: uuid,
        status: STATUS,
        note: z.string().trim().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { auditLog } = await import("./engine.server");
    const { notify } = await import("./notify.server");

    const { data: before } = await supabase
      .from("complaints")
      .select("id, status, complaint_code, complainant_id")
      .eq("id", data.complaintId)
      .maybeSingle();
    if (!before) throw new Error("That complaint could not be found.");

    const closing = data.status === "resolved" || data.status === "rejected" || data.status === "closed";
    const { data: updated, error } = await supabase
      .from("complaints")
      .update({
        status: data.status,
        ...(closing && data.note ? { resolution_note: data.note } : {}),
      })
      .eq("id", data.complaintId)
      .select("id");
    if (error || !updated?.length) throw new Error("The complaint could not be updated.");

    await trackStep(
      supabase,
      userId,
      data.complaintId,
      data.status,
      data.note?.trim() || `Status changed to ${data.status.replace(/_/g, " ")}.`,
    );
    await auditLog(supabase as never, userId, "complaint.status_changed", "complaint", data.complaintId, {
      previous_value: { status: before.status },
      new_value: { status: data.status },
    });
    if (before.complainant_id) {
      await notify(before.complainant_id as string, {
        kind: "complaint_update",
        title: `Complaint ${data.status.replace(/_/g, " ")} — ${before.complaint_code}`,
        body: data.note?.trim() || "The status of your complaint has changed.",
        link: "/complaints",
        entity: "complaint",
        entityId: data.complaintId,
      });
    }
    return { ok: true as const };
  });

/** Opens an inspection pre-filled from the complaint and links the two records. */
export const startInspectionFromComplaint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ complaintId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { auditLog } = await import("./engine.server");
    const { normaliseBarcode } = await import("./domain");

    const { data: complaint } = await supabase
      .from("complaints")
      .select(
        "id, complaint_code, product_name, manufacturer_name, barcode, category, latitude, longitude, region, inspection_id, assigned_to, product_id",
      )
      .eq("id", data.complaintId)
      .maybeSingle();
    if (!complaint) throw new Error("That complaint could not be found.");
    if (complaint.inspection_id) return { inspectionId: complaint.inspection_id as string, reused: true as const };

    const { data: member } = await supabase
      .from("authority_members")
      .select("authority_id, office_id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();

    const barcode = complaint.barcode ? normaliseBarcode(complaint.barcode as string) : null;
    const { data: created, error } = await supabase
      .from("inspections")
      .insert({
        inspector_id: userId,
        authority_id: member?.authority_id ?? null,
        office_id: member?.office_id ?? null,
        category: (complaint.category as string) || "other_packaged",
        barcode,
        barcode_format: barcode ? "complaint" : null,
        product_id: (complaint.product_id as string | null) ?? null,
        product_name: (complaint.product_name as string | null) ?? null,
        manufacturer_name: (complaint.manufacturer_name as string | null) ?? null,
        latitude: complaint.latitude ?? null,
        longitude: complaint.longitude ?? null,
        region: (complaint.region as string | null) ?? null,
        inspector_notes: `Opened from citizen complaint ${complaint.complaint_code}.`,
        status: "draft",
        sync_status: "synced",
        last_synced_at: new Date().toISOString(),
      })
      .select("id, reference_code")
      .single();
    if (error || !created) throw new Error("The inspection could not be opened. An inspector role is required.");

    await supabase
      .from("complaints")
      .update({
        inspection_id: created.id,
        status: "investigation",
        ...(complaint.assigned_to ? {} : { assigned_to: userId, assigned_at: new Date().toISOString() }),
      })
      .eq("id", data.complaintId);

    await trackStep(
      supabase,
      userId,
      data.complaintId,
      "investigation",
      `An inspection (${created.reference_code}) was opened for this complaint.`,
    );
    await auditLog(supabase as never, userId, "complaint.inspection_started", "complaint", data.complaintId, {
      new_value: { inspection_id: created.id },
    });
    return { inspectionId: created.id as string, reused: false as const };
  });

/** Public-facing progress trail for a complaint, for staff detail views. */
export const complaintTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ complaintId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as unknown as { supabase: Sb };
    const { data: updates } = await supabase
      .from("complaint_updates")
      .select("id, status, note, is_public, created_at")
      .eq("complaint_id", data.complaintId)
      .order("created_at", { ascending: true });
    return { updates: (updates ?? []) as Record<string, any>[] };
  });
