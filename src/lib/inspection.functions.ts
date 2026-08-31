import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

import { FIELD_DEFS, FIELD_LABELS, bandFromConfidence } from "./domain";


const BUCKET = "inspection-images";

type Sb = { from: (t: string) => any; storage: any };

/** Read label declarations from the captured images using AI vision. */
export const extractInspectionLabels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ inspectionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { extractFromImages, AiError } = await import("./ai.server");
    const { auditLog: audit } = await import("./engine.server");

    const { data: images, error: imgErr } = await supabase
      .from("inspection_images")
      .select("id, storage_path, side")
      .eq("inspection_id", data.inspectionId)
      .order("created_at");
    if (imgErr) throw new Error("The inspection images could not be read.");
    if (!images || images.length === 0)
      throw new Error("Capture at least one image of the package before extracting information.");

    const signed: { url: string; side: string; id: string }[] = [];
    for (const img of images as { id: string; storage_path: string; side: string }[]) {
      const { data: s } = await supabase.storage.from(BUCKET).createSignedUrl(img.storage_path, 900);
      if (s?.signedUrl) signed.push({ url: s.signedUrl, side: img.side, id: img.id });
    }
    if (signed.length === 0) throw new Error("The stored images could not be opened for reading.");

    await supabase.from("inspections").update({ status: "extracting" }).eq("id", data.inspectionId);

    try {
      const { extraction, model } = await extractFromImages(signed.map((s) => ({ url: s.url, side: s.side })));

      await supabase.from("extractions").insert({
        inspection_id: data.inspectionId,
        provider: "lovable-ai",
        model,
        raw_text: extraction.raw_text,
        structured: extraction as never,
        status: "success",
      });

      // Preserve inspector corrections: only overwrite fields not corrected by a human.
      const { data: existing } = await supabase
        .from("extracted_declarations")
        .select("field_key, corrected")
        .eq("inspection_id", data.inspectionId);
      const locked = new Set(
        ((existing ?? []) as { field_key: string; corrected: boolean }[])
          .filter((e) => e.corrected)
          .map((e) => e.field_key),
      );

      const rows = FIELD_DEFS.filter((f) => !locked.has(f.key)).map((f) => {
        const v = extraction.fields[f.key];
        const sideMatch = signed.find((s) => s.side === v?.side);
        return {
          inspection_id: data.inspectionId,
          field_key: f.key,
          field_label: f.label,
          value: v?.value ?? null,
          detected: !!v?.detected && !!v?.value,
          confidence: v?.confidence ?? 0,
          band: bandFromConfidence(v?.confidence ?? 0),
          source_image_id: sideMatch?.id ?? signed[0]!.id,
          corrected: false,
        };
      });

      await supabase
        .from("extracted_declarations")
        .delete()
        .eq("inspection_id", data.inspectionId)
        .eq("corrected", false);
      if (rows.length) await supabase.from("extracted_declarations").insert(rows as never);

      await supabase
        .from("inspections")
        .update({
          status: "extracted",
          category:
            extraction.category_guess && extraction.category_guess !== "null"
              ? extraction.category_guess
              : undefined,
          product_name:
            extraction.fields["commodity_name"]?.value ?? undefined,
          manufacturer_name: extraction.fields["manufacturer_name"]?.value ?? undefined,
        })
        .eq("id", data.inspectionId);

      await audit(supabase, userId, "extraction.success", "inspection", data.inspectionId, {
        new_value: { model, images: signed.length },
      });

      return {
        ok: true as const,
        quality: extraction.image_quality,
        categoryGuess: extraction.category_guess,
        lockedFields: [...locked],
      };
    } catch (e) {
      const message =
        e instanceof AiError
          ? e.message
          : "We couldn't read the label. Please retry, or enter the details manually.";
      await supabase.from("extractions").insert({
        inspection_id: data.inspectionId,
        provider: "lovable-ai",
        status: "failed",
        error_message: message,
        structured: {} as never,
      });
      await supabase.from("inspections").update({ status: "captured" }).eq("id", data.inspectionId);
      await audit(supabase, userId, "extraction.failed", "inspection", data.inspectionId, {
        reason: message,
      });
      throw new Error(message);
    }
  });

/** Execute the configured legal rules against the current declarations. */
export const runComplianceCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ inspectionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { runEngine } = await import("./engine.server");
    return runEngine(supabase, userId, data.inspectionId);
  });

/** Inspector correction of an extracted value; re-runs the affected rules. */
export const correctDeclaration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        inspectionId: z.string().uuid(),
        fieldKey: z.string().min(1).max(64),
        value: z.string().max(400).nullable(),
        reason: z.string().max(300).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { runEngine, auditLog: audit } = await import("./engine.server");
    const label = FIELD_LABELS[data.fieldKey];
    if (!label) throw new Error("Unknown field.");

    const { data: existing } = await supabase
      .from("extracted_declarations")
      .select("id, value")
      .eq("inspection_id", data.inspectionId)
      .eq("field_key", data.fieldKey)
      .maybeSingle();

    const value = data.value && data.value.trim() !== "" ? data.value.trim() : null;
    const row = {
      inspection_id: data.inspectionId,
      field_key: data.fieldKey,
      field_label: label,
      value,
      detected: value != null,
      confidence: value != null ? 1 : 0,
      band: value != null ? ("high" as const) : ("none" as const),
      corrected: true,
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
    await audit(supabase, userId, "declaration.corrected", "inspection", data.inspectionId, {
      previous_value: { [data.fieldKey]: existing?.value ?? null },
      new_value: { [data.fieldKey]: value },
      reason: data.reason ?? null,
    });

    const { data: hasChecks } = await supabase
      .from("compliance_checks")
      .select("id")
      .eq("inspection_id", data.inspectionId)
      .limit(1);
    if (hasChecks && hasChecks.length > 0) {
      const res = await runEngine(supabase, userId, data.inspectionId);
      return { ok: true as const, rechecked: true as const, ...res };
    }
    return { ok: true as const, rechecked: false as const };
  });

export const finalizeInspection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        inspectionId: z.string().uuid(),
        notes: z.string().max(4000).optional(),
        needsSupervisorReview: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { auditLog: audit } = await import("./engine.server");
    const { data: checks } = await supabase
      .from("compliance_checks")
      .select("id")
      .eq("inspection_id", data.inspectionId)
      .limit(1);
    if (!checks || checks.length === 0)
      throw new Error("Run the compliance check before finalizing this inspection.");

    const { error } = await supabase
      .from("inspections")
      .update({
        status: data.needsSupervisorReview ? "review" : "finalized",
        finalized_at: new Date().toISOString(),
        inspector_notes: data.notes ?? null,
      })
      .eq("id", data.inspectionId);
    if (error) throw new Error("The inspection could not be finalized.");

    await audit(supabase, userId, "inspection.finalized", "inspection", data.inspectionId, {
      new_value: { review: !!data.needsSupervisorReview },
    });
    return { ok: true as const };
  });

/** Builds the immutable report payload and stores it with a checksum. */
export const generateInspectionReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ inspectionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { auditLog: audit } = await import("./engine.server");

    const { data: inspection, error } = await supabase
      .from("inspections")
      .select("*")
      .eq("id", data.inspectionId)
      .single();
    if (error || !inspection) throw new Error("Inspection not found.");

    const [{ data: checks }, { data: declarations }, { data: images }, { data: corrections }] =
      await Promise.all([
        supabase.from("compliance_checks").select("*").eq("inspection_id", data.inspectionId),
        supabase.from("extracted_declarations").select("*").eq("inspection_id", data.inspectionId),
        supabase.from("inspection_images").select("*").eq("inspection_id", data.inspectionId),
        supabase.from("field_corrections").select("*").eq("inspection_id", data.inspectionId),
      ]);

    if (!checks || checks.length === 0)
      throw new Error("Run the compliance check before generating a report.");

    let versionLabel = "";
    let sourceDoc = "";
    if (inspection.rule_version_id) {
      const { data: v } = await supabase
        .from("rule_versions")
        .select("version_label, source_document")
        .eq("id", inspection.rule_version_id)
        .maybeSingle();
      versionLabel = v?.version_label ?? "";
      sourceDoc = v?.source_document ?? "";
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email, designation")
      .eq("id", inspection.inspector_id)
      .maybeSingle();

    let authority: { name: string; code: string } | null = null;
    if (inspection.authority_id) {
      const { data: a } = await supabase
        .from("authorities")
        .select("name, code")
        .eq("id", inspection.authority_id)
        .maybeSingle();
      authority = a ?? null;
    }

    const payload = {
      inspection,
      inspector: profile ?? null,
      authority,
      checks,
      declarations: declarations ?? [],
      images: images ?? [],
      corrections: corrections ?? [],
      rule_version: { label: versionLabel, source_document: sourceDoc },
      generated_at: new Date().toISOString(),
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

    await audit(supabase, userId, "report.generated", "report", report.id, {
      new_value: { report_code: reportCode },
    });

    return { report, payload };
  });

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
