/**
 * Inspector pipeline — client-callable server functions.
 *
 * Each stage is a separate, auditable step:
 *   create → capture → OCR → structure → review/correct → category → rules →
 *   supervisor review → finalize → report → (controlled amendment)
 *
 * Only handler bodies run on the server, so anything server-only is imported
 * inside a handler.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

import { CATEGORIES, FIELD_DEFS, FIELD_LABELS } from "./domain";

type Sb = {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
  storage: any;
};

const uuid = z.string().uuid();
const categoryValues = CATEGORIES.map((c) => c.value) as [string, ...string[]];
const fieldKeys = FIELD_DEFS.map((f) => f.key) as [string, ...string[]];

/** Configuration state of the OCR engines, so the UI can be honest about it. */
export const ocrConfiguration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { ocrConfigStatus } = await import("./ocr.server");
    const status = ocrConfigStatus();
    return {
      primaryConfigured: status.primaryConfigured,
      primaryLabel: status.primary.label,
      primaryShort: status.primary.shortLabel,
      primaryDescription: status.primary.description,
      fallbackLabel: status.fallback.label,
      fallbackShort: status.fallback.shortLabel,
      fallbackDescription: status.fallback.description,
      secretName: status.secretName,
      message: status.message,
    };
  });

/** Creates an inspection. Idempotent on `clientRef` so offline retries are safe. */
export const createInspection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        category: z.enum(categoryValues),
        barcode: z.string().trim().max(64).nullable().optional(),
        barcodeFormat: z.string().trim().max(32).nullable().optional(),
        productName: z.string().trim().max(200).nullable().optional(),
        manufacturerName: z.string().trim().max(200).nullable().optional(),
        locationLabel: z.string().trim().max(200).nullable().optional(),
        latitude: z.number().min(-90).max(90).nullable().optional(),
        longitude: z.number().min(-180).max(180).nullable().optional(),
        region: z.string().trim().max(120).nullable().optional(),
        clientRef: z.string().trim().min(6).max(80).optional(),
        notes: z.string().trim().max(4000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { auditLog } = await import("./engine.server");
    const { normaliseBarcode } = await import("./domain");

    if (data.clientRef) {
      const { data: existing } = await supabase
        .from("inspections")
        .select("id, reference_code")
        .eq("inspector_id", userId)
        .eq("client_ref", data.clientRef)
        .maybeSingle();
      if (existing) return { id: existing.id as string, reference_code: existing.reference_code as string, reused: true as const };
    }

    const { data: member } = await supabase
      .from("authority_members")
      .select("authority_id, office_id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();

    const barcode = data.barcode ? normaliseBarcode(data.barcode) : null;
    let productId: string | null = null;
    if (barcode) {
      const { data: link } = await supabase
        .from("product_barcodes")
        .select("product_id")
        .eq("barcode", barcode)
        .maybeSingle();
      productId = (link?.product_id as string | undefined) ?? null;
    }

    const { data: created, error } = await supabase
      .from("inspections")
      .insert({
        inspector_id: userId,
        authority_id: member?.authority_id ?? null,
        office_id: member?.office_id ?? null,
        category: data.category,
        barcode,
        barcode_format: barcode ? (data.barcodeFormat ?? "manual") : null,
        product_id: productId,
        product_name: data.productName ?? null,
        manufacturer_name: data.manufacturerName ?? null,
        location_label: data.locationLabel ?? null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        region: data.region ?? null,
        inspector_notes: data.notes ?? null,
        client_ref: data.clientRef ?? null,
        status: "draft",
        sync_status: "synced",
        last_synced_at: new Date().toISOString(),
      })
      .select("id, reference_code")
      .single();
    if (error || !created) {
      console.error("[inspection] create failed", error);
      throw new Error("The inspection could not be created. Only inspection staff may open one.");
    }

    await auditLog(supabase as never, userId, "inspection.created", "inspection", created.id, {
      new_value: { category: data.category, barcode, client_ref: data.clientRef ?? null },
      authority_id: member?.authority_id ?? null,
    });
    return { id: created.id as string, reference_code: created.reference_code as string, reused: false as const };
  });

/** Runs the server-side OCR engine (Google Cloud Vision) over the images. */
export const runInspectionOcr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ inspectionId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { runServerOcr } = await import("./pipeline.server");
    const { outcome, imageCount } = await runServerOcr(supabase as never, userId, data.inspectionId);
    return {
      status: outcome.status,
      provider: outcome.provider,
      providerLabel: outcome.providerLabel,
      meanConfidence: outcome.meanConfidence,
      wordCount: outcome.wordCount,
      durationMs: outcome.durationMs,
      error: outcome.error,
      textPreview: outcome.rawText.slice(0, 1200),
      imageCount,
    };
  });

/** Stores a reading produced by the OCR engine running on the inspector's device. */
export const ingestDeviceOcr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        inspectionId: uuid,
        rawText: z.string().max(60000),
        meanConfidence: z.number().min(0).max(1).nullable(),
        wordCount: z.number().int().min(0).max(100000),
        durationMs: z.number().min(0).max(600000),
        blocks: z
          .array(
            z.object({
              text: z.string().max(600),
              confidence: z.number().min(0).max(1),
              bbox: z.object({
                x0: z.number(),
                y0: z.number(),
                x1: z.number(),
                y1: z.number(),
              }),
              side: z.string().max(32),
              imageIndex: z.number().int().min(0).max(50),
            }),
          )
          .max(400),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { ingestDeviceOcrResult } = await import("./pipeline.server");
    const { outcome } = await ingestDeviceOcrResult(supabase as never, userId, data.inspectionId, {
      provider: "tesseract_browser",
      rawText: data.rawText,
      blocks: data.blocks,
      meanConfidence: data.meanConfidence,
      wordCount: data.wordCount,
      durationMs: data.durationMs,
    });
    return {
      status: outcome.status,
      provider: outcome.provider,
      providerLabel: outcome.providerLabel,
      meanConfidence: outcome.meanConfidence,
      wordCount: outcome.wordCount,
      error: outcome.error,
    };
  });

/** Maps the stored OCR text onto declaration fields with AI. */
export const structureDeclarations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ inspectionId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { structureFromStoredOcr } = await import("./pipeline.server");
    return structureFromStoredOcr(supabase as never, userId, data.inspectionId);
  });

/** Declarations typed by a person, used offline or when OCR cannot read a pack. */
export const saveManualDeclarations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        inspectionId: uuid,
        fields: z.record(z.enum(fieldKeys), z.string().max(400).nullable()),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { writeManualDeclarations } = await import("./pipeline.server");
    return writeManualDeclarations(
      supabase as never,
      userId,
      data.inspectionId,
      data.fields as Record<string, string | null>,
    );
  });

/**
 * The inspector confirms which commodity category applies. AI may only suggest;
 * the legal checks use the confirmed human decision.
 */
export const confirmCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ inspectionId: uuid, category: z.enum(categoryValues) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { auditLog } = await import("./engine.server");

    const { data: before } = await supabase
      .from("inspections")
      .select("category, ai_suggested_category, authority_id")
      .eq("id", data.inspectionId)
      .maybeSingle();

    const { data: updated, error } = await supabase
      .from("inspections")
      .update({
        category: data.category,
        category_confirmed: true,
        category_confirmed_by: userId,
        category_confirmed_at: new Date().toISOString(),
      })
      .eq("id", data.inspectionId)
      .select("id");
    if (error || !updated || updated.length === 0)
      throw new Error("The category could not be confirmed for this inspection.");

    await auditLog(supabase as never, userId, "inspection.category_confirmed", "inspection", data.inspectionId, {
      previous_value: { category: before?.category ?? null },
      new_value: { category: data.category, ai_suggested: before?.ai_suggested_category ?? null },
      authority_id: before?.authority_id ?? null,
    });
    return { ok: true as const };
  });

/** Executes the configured legal rules against the current declarations. */
export const runComplianceCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ inspectionId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { runEngine } = await import("./engine.server");
    const result = await runEngine(supabase as never, userId, data.inspectionId);
    return {
      summary: result.summary,
      conflict: result.conflict,
      changed: result.changed,
      registry: {
        match: result.registry.match,
        headline: result.registry.headline,
        differences: result.registry.differences,
        matchedBatch: result.registry.matchedBatch,
        needsHumanReview: result.registry.needsHumanReview,
      },
    };
  });

/** Compares the package against the product registry without re-running rules. */
export const compareAgainstRegistry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ inspectionId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as unknown as { supabase: Sb };
    const { compareRegistry } = await import("./engine.server");

    const { data: inspection, error } = await supabase
      .from("inspections")
      .select("id, product_id, barcode, authority_id")
      .eq("id", data.inspectionId)
      .single();
    if (error || !inspection) throw new Error("Inspection not found.");

    const { data: declarations } = await supabase
      .from("extracted_declarations")
      .select("field_key, value, confidence")
      .eq("inspection_id", data.inspectionId);

    const { comparison, product } = await compareRegistry(
      supabase as never,
      inspection as never,
      (declarations ?? []) as never,
    );
    return {
      match: comparison.match,
      headline: comparison.headline,
      differences: comparison.differences,
      matchedBatch: comparison.matchedBatch,
      needsHumanReview: comparison.needsHumanReview,
      product: product
        ? {
            id: product.id,
            name: product.name,
            sku_code: product.sku_code,
            manufacturer_name: product.manufacturer_name,
            status: product.status,
            batches: product.batches.map((b) => ({ id: b.id, batch_code: b.batch_code, status: b.status })),
          }
        : null,
    };
  });

/** Inspector correction of a read value; re-runs the affected rules. */
export const correctDeclaration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        inspectionId: uuid,
        fieldKey: z.enum(fieldKeys),
        value: z.string().max(400).nullable(),
        reason: z.string().max(300).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { runEngine, auditLog } = await import("./engine.server");
    const label = FIELD_LABELS[data.fieldKey];
    if (!label) throw new Error("Unknown field.");

    const { data: existing } = await supabase
      .from("extracted_declarations")
      .select("id, value, confidence, original_value, original_confidence, source_image_id, ocr_snippet, ocr_bbox")
      .eq("inspection_id", data.inspectionId)
      .eq("field_key", data.fieldKey)
      .maybeSingle();

    const value = data.value && data.value.trim() !== "" ? data.value.trim() : null;
    // The original reading is never overwritten — it is preserved for the report.
    const row = {
      inspection_id: data.inspectionId,
      field_key: data.fieldKey,
      field_label: label,
      value,
      detected: value != null,
      confidence: value != null ? 1 : 0,
      band: value != null ? ("high" as const) : ("none" as const),
      corrected: true,
      original_value: existing?.original_value ?? existing?.value ?? null,
      original_confidence: existing?.original_confidence ?? existing?.confidence ?? 0,
    };

    if (existing) {
      const { error } = await supabase.from("extracted_declarations").update(row).eq("id", existing.id);
      if (error) throw new Error("The correction could not be saved.");
    } else {
      const { error } = await supabase.from("extracted_declarations").insert(row as never);
      if (error) throw new Error("The correction could not be saved.");
    }

    await supabase.from("field_corrections").insert({
      inspection_id: data.inspectionId,
      field_key: data.fieldKey,
      previous_value: existing?.value ?? null,
      new_value: value,
      corrected_by: userId,
      reason: data.reason ?? null,
    });
    await auditLog(supabase as never, userId, "declaration.corrected", "inspection", data.inspectionId, {
      previous_value: { [data.fieldKey]: existing?.value ?? null },
      new_value: { [data.fieldKey]: value },
      ...(data.reason ? { reason: data.reason } : {}),
    });

    const { data: hasChecks } = await supabase
      .from("compliance_checks")
      .select("id")
      .eq("inspection_id", data.inspectionId)
      .limit(1);
    if (hasChecks && hasChecks.length > 0) {
      const res = await runEngine(supabase as never, userId, data.inspectionId);
      return {
        ok: true as const,
        rechecked: true as const,
        summary: res.summary,
        changed: res.changed,
        registryMatch: res.registry.match,
      };
    }
    return { ok: true as const, rechecked: false as const };
  });

/** Inspector asks a supervisor to look at the inspection. One consistent schema. */
export const requestSupervisorReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ inspectionId: uuid, notes: z.string().max(2000).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { auditLog } = await import("./engine.server");
    const { notifyAuthorityStaff } = await import("./notify.server");

    const { data: updated, error } = await supabase
      .from("inspections")
      .update({
        review_requested: true,
        supervisor_decision: "pending",
        ...(data.notes ? { inspector_notes: data.notes } : {}),
      })
      .eq("id", data.inspectionId)
      .select("id, reference_code, authority_id");
    if (error || !updated || updated.length === 0)
      throw new Error("Supervisor review could not be requested for this inspection.");

    const row = updated[0]!;
    if (row.authority_id) {
      await notifyAuthorityStaff(row.authority_id as string, ["supervisor", "authority_admin"], {
        kind: "review_requested",
        title: `Review requested — ${row.reference_code}`,
        body: data.notes ?? "An inspector has asked for supervisor review of this inspection.",
        link: `/inspections/${data.inspectionId}`,
        entity: "inspection",
        entityId: data.inspectionId,
      });
    }
    await auditLog(supabase as never, userId, "inspection.review_requested", "inspection", data.inspectionId, {
      new_value: { review_requested: true },
      authority_id: (row.authority_id as string | null) ?? null,
    });
    return { ok: true as const };
  });

/** Supervisor or authority administrator records a decision. */
export const recordSupervisorDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        inspectionId: uuid,
        decision: z.enum(["approved", "rejected", "returned", "pending"]),
        notes: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as unknown as { supabase: Sb };
    const { notify } = await import("./notify.server");

    const { error } = await supabase.rpc("record_supervisor_decision", {
      _inspection_id: data.inspectionId,
      _decision: data.decision,
      _notes: data.notes ?? "",
    });
    if (error) {
      const message = String((error as { message?: string }).message ?? "");
      if (message.includes("another authority"))
        throw new Error("This inspection belongs to another authority.");
      if (message.includes("Supervisor role"))
        throw new Error("Only a supervisor or authority administrator may record a decision.");
      throw new Error("The decision could not be recorded.");
    }

    const { data: ins } = await supabase
      .from("inspections")
      .select("inspector_id, reference_code")
      .eq("id", data.inspectionId)
      .maybeSingle();
    if (ins?.inspector_id) {
      await notify(ins.inspector_id as string, {
        kind: "supervisor_decision",
        title: `Supervisor decision — ${ins.reference_code}`,
        body: `The inspection was marked “${data.decision}”.${data.notes ? ` Note: ${data.notes}` : ""}`,
        link: `/inspections/${data.inspectionId}`,
        entity: "inspection",
        entityId: data.inspectionId,
      });
    }
    return { ok: true as const };
  });

export const finalizeInspection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        inspectionId: uuid,
        notes: z.string().max(4000).optional(),
        requestReview: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { auditLog } = await import("./engine.server");
    const { notifyAuthorityStaff } = await import("./notify.server");

    const { data: inspection } = await supabase
      .from("inspections")
      .select("id, status, category_confirmed, reference_code, authority_id")
      .eq("id", data.inspectionId)
      .maybeSingle();
    if (!inspection) throw new Error("Inspection not found.");
    if (!inspection.category_confirmed)
      throw new Error("Confirm the commodity category before finalizing this inspection.");

    const { data: checks } = await supabase
      .from("compliance_checks")
      .select("id")
      .eq("inspection_id", data.inspectionId)
      .limit(1);
    if (!checks || checks.length === 0)
      throw new Error("Run the compliance check before finalizing this inspection.");

    const { data: updated, error } = await supabase
      .from("inspections")
      .update({
        status: "finalized",
        review_requested: !!data.requestReview,
        supervisor_decision: data.requestReview ? "pending" : null,
        finalized_at: new Date().toISOString(),
        ...(data.notes ? { inspector_notes: data.notes } : {}),
      })
      .eq("id", data.inspectionId)
      .select("id");
    if (error) throw new Error("The inspection could not be finalized.");
    // A row-level permission block returns no error, just zero updated rows.
    if (!updated || updated.length === 0)
      throw new Error("You are not allowed to finalize this inspection, or it is already finalized.");

    if (data.requestReview && inspection.authority_id) {
      await notifyAuthorityStaff(inspection.authority_id as string, ["supervisor", "authority_admin"], {
        kind: "review_requested",
        title: `Review requested — ${inspection.reference_code}`,
        body: "A finalized inspection is waiting for supervisor review.",
        link: `/inspections/${data.inspectionId}`,
        entity: "inspection",
        entityId: data.inspectionId,
      });
    }

    await auditLog(supabase as never, userId, "inspection.finalized", "inspection", data.inspectionId, {
      new_value: { review: !!data.requestReview },
      authority_id: (inspection.authority_id as string | null) ?? null,
    });
    return { ok: true as const };
  });

/**
 * Finalized records are immutable. A change goes through a recorded amendment
 * request that an authority administrator must approve.
 */
export const requestAmendment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        inspectionId: uuid,
        reason: z.string().trim().min(10).max(1000),
        changes: z
          .object({
            inspector_notes: z.string().max(4000).optional(),
            supervisor_notes: z.string().max(4000).optional(),
            location_label: z.string().max(200).optional(),
            product_name: z.string().max(200).optional(),
            manufacturer_name: z.string().max(200).optional(),
          })
          .refine((c) => Object.keys(c).length > 0, "Describe at least one change."),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { auditLog } = await import("./engine.server");
    const { notifyAuthorityStaff } = await import("./notify.server");

    const { data: created, error } = await supabase
      .from("inspection_amendments")
      .insert({
        inspection_id: data.inspectionId,
        requested_by: userId,
        reason: data.reason,
        changes: data.changes as never,
        status: "pending",
      })
      .select("id")
      .single();
    if (error || !created) throw new Error("The amendment request could not be recorded.");

    const { data: ins } = await supabase
      .from("inspections")
      .select("reference_code, authority_id")
      .eq("id", data.inspectionId)
      .maybeSingle();
    if (ins?.authority_id) {
      await notifyAuthorityStaff(ins.authority_id as string, ["authority_admin"], {
        kind: "amendment_requested",
        title: `Amendment requested — ${ins.reference_code}`,
        body: data.reason,
        link: `/authority`,
        entity: "inspection_amendment",
        entityId: created.id as string,
      });
    }
    await auditLog(supabase as never, userId, "inspection.amendment_requested", "inspection", data.inspectionId, {
      new_value: data.changes,
      reason: data.reason,
      authority_id: (ins?.authority_id as string | null) ?? null,
    });
    return { id: created.id as string };
  });

export const decideAmendment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ amendmentId: uuid, approve: z.boolean(), note: z.string().max(1000).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { auditLog } = await import("./engine.server");
    const { notify } = await import("./notify.server");

    const { data: amendment } = await supabase
      .from("inspection_amendments")
      .select("id, inspection_id, requested_by, status")
      .eq("id", data.amendmentId)
      .maybeSingle();
    if (!amendment) throw new Error("Amendment not found.");
    if (amendment.status !== "pending") throw new Error("This amendment has already been decided.");

    if (data.approve) {
      const { error } = await supabase.rpc("apply_inspection_amendment", { _amendment_id: data.amendmentId });
      if (error) throw new Error("Only an authority administrator may approve an amendment.");
    } else {
      const { data: rejected, error } = await supabase
        .from("inspection_amendments")
        .update({ status: "rejected", approved_by: userId, decided_at: new Date().toISOString() })
        .eq("id", data.amendmentId)
        .select("id");
      if (error || !rejected || rejected.length === 0)
        throw new Error("Only an authority administrator may decide an amendment.");
      await auditLog(supabase as never, userId, "inspection.amendment_rejected", "inspection", amendment.inspection_id, {
        reason: data.note ?? null,
      });
    }

    await notify(amendment.requested_by as string, {
      kind: "amendment_decided",
      title: data.approve ? "Amendment approved" : "Amendment rejected",
      body: data.note ?? (data.approve ? "The correction was applied to the finalized record." : "The request was not approved."),
      link: `/inspections/${amendment.inspection_id}`,
      entity: "inspection",
      entityId: amendment.inspection_id as string,
    });
    return { ok: true as const };
  });

/** Builds the immutable report payload and stores it with a checksum. */
export const generateInspectionReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ inspectionId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { auditLog, compareRegistry } = await import("./engine.server");

    const { data: inspection, error } = await supabase
      .from("inspections")
      .select("*")
      .eq("id", data.inspectionId)
      .single();
    if (error || !inspection) throw new Error("Inspection not found.");

    const [
      { data: checks },
      { data: declarations },
      { data: images },
      { data: corrections },
      { data: ocr },
      { data: extraction },
      { data: amendments },
    ] = await Promise.all([
      supabase
        .from("compliance_checks")
        .select("*")
        .eq("inspection_id", data.inspectionId)
        .order("rule_number"),
      supabase.from("extracted_declarations").select("*").eq("inspection_id", data.inspectionId),
      supabase.from("inspection_images").select("*").eq("inspection_id", data.inspectionId),
      supabase
        .from("field_corrections")
        .select("*")
        .eq("inspection_id", data.inspectionId)
        .order("created_at"),
      supabase
        .from("ocr_results")
        .select("provider, provider_label, model, status, mean_confidence, word_count, duration_ms, created_at")
        .eq("inspection_id", data.inspectionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("extractions")
        .select("provider, model, input_source, status, created_at")
        .eq("inspection_id", data.inspectionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("inspection_amendments")
        .select("reason, changes, status, decided_at")
        .eq("inspection_id", data.inspectionId)
        .eq("status", "approved"),
    ]);

    if (!checks || checks.length === 0)
      throw new Error("Run the compliance check before generating a report.");

    let versionLabel = "";
    let sourceDoc = "";
    let effectiveFrom: string | null = null;
    if (inspection.rule_version_id) {
      const { data: v } = await supabase
        .from("rule_versions")
        .select("version_label, source_document, effective_from")
        .eq("id", inspection.rule_version_id)
        .maybeSingle();
      versionLabel = v?.version_label ?? "";
      sourceDoc = v?.source_document ?? "";
      effectiveFrom = v?.effective_from ?? null;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email, designation")
      .eq("id", inspection.inspector_id)
      .maybeSingle();

    let authority: { name: string; code: string; state: string | null } | null = null;
    if (inspection.authority_id) {
      const { data: a } = await supabase
        .from("authorities")
        .select("name, code, state")
        .eq("id", inspection.authority_id)
        .maybeSingle();
      authority = a ?? null;
    }
    let office: { name: string; district: string | null; state: string | null } | null = null;
    if (inspection.office_id) {
      const { data: o } = await supabase
        .from("offices")
        .select("name, district, state")
        .eq("id", inspection.office_id)
        .maybeSingle();
      office = o ?? null;
    }

    const { comparison, product } = await compareRegistry(
      supabase as never,
      inspection as never,
      (declarations ?? []) as never,
    );

    let batch: Record<string, unknown> | null = null;
    if (inspection.batch_id) {
      const { data: b } = await supabase
        .from("batches")
        .select("batch_code, production_date, packing_date, declared_mrp, declared_net_quantity, status")
        .eq("id", inspection.batch_id)
        .maybeSingle();
      batch = b ?? null;
    }

    const payload = {
      inspection,
      inspector: profile ?? null,
      authority,
      office,
      checks,
      declarations: declarations ?? [],
      images: images ?? [],
      corrections: corrections ?? [],
      amendments: amendments ?? [],
      ocr: ocr ?? null,
      extraction: extraction ?? null,
      registry: {
        match: comparison.match,
        headline: comparison.headline,
        differences: comparison.differences,
        product: product
          ? {
              id: product.id,
              name: product.name,
              sku_code: product.sku_code,
              status: product.status,
              manufacturer_name: product.manufacturer_name,
              declared_mrp: product.declared_mrp,
              declared_net_quantity: product.declared_net_quantity,
            }
          : null,
        batch,
      },
      rule_version: { label: versionLabel, source_document: sourceDoc, effective_from: effectiveFrom },
      generated_at: new Date().toISOString(),
      disclaimer:
        "AI-assisted inspection report produced under the Legal Metrology (Packaged Commodities) Rules, 2011. It records observations, readings and rule outcomes; it is not a court order or a legal notice, and it carries force only when adopted by the competent authority.",
    };

    const checksum = await sha256(JSON.stringify(payload));
    const reportCode = `RPT-${inspection.reference_code}-${checksum.slice(0, 8).toUpperCase()}`;

    const { data: report, error: repErr } = await supabase
      .from("reports")
      .insert({
        inspection_id: data.inspectionId,
        report_code: reportCode,
        checksum,
        payload: payload as never,
        generated_by: userId,
        rule_version_id: inspection.rule_version_id,
      })
      .select("id, report_code, checksum, created_at")
      .single();
    if (repErr) throw new Error("The report could not be generated.");

    await auditLog(supabase as never, userId, "report.generated", "report", report.id, {
      new_value: { report_code: reportCode, checksum },
      authority_id: (inspection.authority_id as string | null) ?? null,
    });

    return { report, payload };
  });

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
