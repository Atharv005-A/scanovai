/**
 * Server-only inspection pipeline.
 *
 *   package images → real OCR → AI structuring → human review → rule engine
 *
 * Each stage is separate and recorded, so a report can always answer "where did
 * this value come from?": which engine read it, from which image, with what
 * confidence, and whether a person changed it afterwards.
 */

import { FIELD_DEFS, FIELD_LABELS, bandFromConfidence } from "./domain";
import { auditLog } from "./engine.server";
import {
  locateSnippet,
  normaliseDeviceOcr,
  ocrConfigStatus,
  runServerSideOcr,
  type DeviceOcrPayload,
  type OcrBlock,
  type OcrOutcome,
} from "./ocr.server";

type Sb = {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  storage: {
    from: (b: string) => {
      download: (path: string) => Promise<{ data: Blob | null; error: unknown }>;
      createSignedUrl: (
        path: string,
        seconds: number,
      ) => Promise<{ data: { signedUrl: string } | null; error: unknown }>;
    };
  };
};

export const INSPECTION_BUCKET = "inspection-images";

export interface ImageRow {
  id: string;
  storage_path: string;
  processed_path: string | null;
  side: string;
  quality_score: number | null;
  quality_note: string | null;
}

export async function loadImages(sb: Sb, inspectionId: string): Promise<ImageRow[]> {
  const { data, error } = await sb
    .from("inspection_images")
    .select("id, storage_path, processed_path, side, quality_score, quality_note")
    .eq("inspection_id", inspectionId)
    .eq("kind", "original")
    .order("created_at");
  if (error) throw new Error("The inspection images could not be read.");
  return (data ?? []) as ImageRow[];
}

export async function signedUrlsFor(sb: Sb, images: ImageRow[], seconds = 900) {
  const out: { url: string; side: string; id: string }[] = [];
  for (const img of images) {
    const { data } = await sb.storage.from(INSPECTION_BUCKET).createSignedUrl(img.storage_path, seconds);
    if (data?.signedUrl) out.push({ url: data.signedUrl, side: img.side, id: img.id });
  }
  return out;
}

async function toBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function storeOcrResult(
  sb: Sb,
  target: { inspectionId?: string | null; packageScanId?: string | null; imageId?: string | null },
  outcome: OcrOutcome,
) {
  const { data, error } = await sb
    .from("ocr_results")
    .insert({
      inspection_id: target.inspectionId ?? null,
      package_scan_id: target.packageScanId ?? null,
      image_id: target.imageId ?? null,
      provider: outcome.provider,
      provider_label: outcome.providerLabel,
      model: outcome.model,
      status: outcome.status === "succeeded" ? "succeeded" : outcome.status === "not_configured" ? "not_configured" : "failed",
      raw_text: outcome.rawText || null,
      blocks: outcome.blocks as never,
      mean_confidence: outcome.meanConfidence,
      word_count: outcome.wordCount,
      duration_ms: outcome.durationMs,
      error_message: outcome.error,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[pipeline] ocr_results insert failed", error);
    return null;
  }
  return data.id as string;
}

/**
 * Runs the server-side OCR provider over an inspection's images.
 * Returns `not_configured` — never a fabricated success — when no credential
 * is present on the deployment.
 */
export async function runServerOcr(
  sb: Sb,
  userId: string,
  inspectionId: string,
): Promise<{ outcome: OcrOutcome; ocrResultId: string | null; imageCount: number }> {
  const images = await loadImages(sb, inspectionId);
  if (images.length === 0)
    throw new Error("Capture at least one image of the package before reading it.");

  const config = ocrConfigStatus();
  if (!config.primaryConfigured) {
    const outcome: OcrOutcome = {
      provider: config.primary.id,
      providerLabel: config.primary.label,
      model: null,
      status: "not_configured",
      rawText: "",
      blocks: [],
      meanConfidence: null,
      wordCount: 0,
      durationMs: 0,
      error: config.message,
    };
    await sb
      .from("inspections")
      .update({ ocr_status: "not_configured", ocr_provider: config.primary.id })
      .eq("id", inspectionId);
    return { outcome, ocrResultId: null, imageCount: images.length };
  }

  await sb.from("inspections").update({ ocr_status: "processing" }).eq("id", inspectionId);

  const payloads: { content: string; side: string }[] = [];
  for (const img of images) {
    const path = img.processed_path ?? img.storage_path;
    const { data: blob } = await sb.storage.from(INSPECTION_BUCKET).download(path);
    if (!blob) continue;
    payloads.push({ content: await toBase64(blob), side: img.side });
  }
  if (payloads.length === 0) {
    await sb.from("inspections").update({ ocr_status: "failed" }).eq("id", inspectionId);
    throw new Error("The stored images could not be opened for reading.");
  }

  const outcome = await runServerSideOcr(payloads);
  const ocrResultId = await storeOcrResult(sb, { inspectionId }, outcome);

  await sb
    .from("inspections")
    .update({
      ocr_status: outcome.status === "succeeded" ? "succeeded" : "failed",
      ocr_provider: outcome.provider,
    })
    .eq("id", inspectionId);
  await sb
    .from("inspection_images")
    .update({ ocr_status: outcome.status === "succeeded" ? "succeeded" : "failed" })
    .eq("inspection_id", inspectionId);

  await auditLog(sb, userId, `ocr.${outcome.status}`, "inspection", inspectionId, {
    new_value: {
      provider: outcome.provider,
      words: outcome.wordCount,
      mean_confidence: outcome.meanConfidence,
      duration_ms: outcome.durationMs,
      images: payloads.length,
    },
    ...(outcome.error ? { reason: outcome.error } : {}),
  });

  return { outcome, ocrResultId, imageCount: payloads.length };
}

/** Records an OCR run performed by the engine on the inspector's device. */
export async function ingestDeviceOcrResult(
  sb: Sb,
  userId: string,
  inspectionId: string,
  payload: DeviceOcrPayload,
) {
  const outcome = normaliseDeviceOcr(payload);
  await sb.from("inspections").update({ ocr_status: "processing" }).eq("id", inspectionId);
  const ocrResultId = await storeOcrResult(sb, { inspectionId }, outcome);
  await sb
    .from("inspections")
    .update({
      ocr_status: outcome.status === "succeeded" ? "succeeded" : "failed",
      ocr_provider: outcome.provider,
    })
    .eq("id", inspectionId);
  await sb
    .from("inspection_images")
    .update({ ocr_status: outcome.status === "succeeded" ? "succeeded" : "failed" })
    .eq("inspection_id", inspectionId);
  await auditLog(sb, userId, `ocr.${outcome.status}`, "inspection", inspectionId, {
    new_value: {
      provider: outcome.provider,
      words: outcome.wordCount,
      mean_confidence: outcome.meanConfidence,
      duration_ms: outcome.durationMs,
      on_device: true,
    },
    ...(outcome.error ? { reason: outcome.error } : {}),
  });
  return { outcome, ocrResultId };
}

export async function latestOcrResult(sb: Sb, inspectionId: string) {
  const { data } = await sb
    .from("ocr_results")
    .select("id, provider, provider_label, model, status, raw_text, blocks, mean_confidence, word_count, created_at")
    .eq("inspection_id", inspectionId)
    .eq("status", "succeeded")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as
    | {
        id: string;
        provider: string;
        provider_label: string;
        model: string | null;
        status: string;
        raw_text: string | null;
        blocks: OcrBlock[];
        mean_confidence: number | null;
        word_count: number | null;
        created_at: string;
      }
    | null;
}

/**
 * Maps the stored OCR text onto declaration fields with AI, then writes the
 * declarations. Inspector corrections are never overwritten.
 */
export async function structureFromStoredOcr(sb: Sb, userId: string, inspectionId: string) {
  const { structureFromOcr, AiError } = await import("./ai.server");
  const ocr = await latestOcrResult(sb, inspectionId);
  if (!ocr || !ocr.raw_text)
    throw new Error("Read the package with the OCR engine before organising the declarations.");

  const images = await loadImages(sb, inspectionId);
  const signed = await signedUrlsFor(sb, images.slice(0, 3));

  try {
    const structured = await structureFromOcr({
      ocrText: ocr.raw_text,
      blocks: ocr.blocks ?? [],
      imageUrls: signed.map((s) => ({ url: s.url, side: s.side })),
    });

    await sb.from("extractions").insert({
      inspection_id: inspectionId,
      provider: "lovable-ai",
      model: structured.model,
      input_source: "ocr_text",
      ocr_result_id: ocr.id,
      raw_text: ocr.raw_text,
      structured: structured as never,
      status: "success",
    });

    const { data: existing } = await sb
      .from("extracted_declarations")
      .select("id, field_key, corrected, original_value, original_confidence")
      .eq("inspection_id", inspectionId);
    const rows = (existing ?? []) as {
      id: string;
      field_key: string;
      corrected: boolean;
      original_value: string | null;
      original_confidence: number | null;
    }[];
    const locked = new Set(rows.filter((r) => r.corrected).map((r) => r.field_key));

    const sideToImage = new Map(images.map((i) => [i.side, i.id]));
    const fallbackImage = images[0]?.id ?? null;

    const upserts = FIELD_DEFS.filter((f) => !locked.has(f.key)).map((f) => {
      const v = structured.fields[f.key];
      const block = locateSnippet(ocr.blocks ?? [], v?.ocr_snippet ?? v?.value ?? null);
      const imageId =
        (block ? sideToImage.get(block.side) : undefined) ??
        (v?.side ? sideToImage.get(v.side) : undefined) ??
        fallbackImage;
      return {
        inspection_id: inspectionId,
        field_key: f.key,
        field_label: f.label,
        value: v?.value ?? null,
        detected: !!v?.detected && !!v?.value,
        confidence: v?.confidence ?? 0,
        band: bandFromConfidence(v?.confidence ?? 0),
        source_image_id: imageId,
        corrected: false,
        ocr_snippet: v?.ocr_snippet ?? null,
        ocr_bbox: block ? (block.bbox as never) : null,
        original_value: v?.value ?? null,
        original_confidence: v?.confidence ?? 0,
      };
    });

    await sb
      .from("extracted_declarations")
      .delete()
      .eq("inspection_id", inspectionId)
      .eq("corrected", false);
    if (upserts.length) await sb.from("extracted_declarations").insert(upserts as never);

    const { data: inspection } = await sb
      .from("inspections")
      .select("category_confirmed, product_name, manufacturer_name, authority_id")
      .eq("id", inspectionId)
      .maybeSingle();

    await sb
      .from("inspections")
      .update({
        status: "extracted",
        ai_suggested_category: structured.category_guess,
        product_name:
          structured.fields["commodity_name"]?.value ?? inspection?.product_name ?? null,
        manufacturer_name:
          structured.fields["manufacturer_name"]?.value ?? inspection?.manufacturer_name ?? null,
      })
      .eq("id", inspectionId);

    await auditLog(sb, userId, "extraction.success", "inspection", inspectionId, {
      new_value: {
        model: structured.model,
        ocr_result_id: ocr.id,
        fields_detected: Object.values(structured.fields).filter((f) => f.detected).length,
        ungrounded_dropped: structured.ungrounded,
      },
      authority_id: inspection?.authority_id ?? null,
    });

    return {
      ok: true as const,
      lockedFields: [...locked],
      categoryGuess: structured.category_guess,
      categoryReason: structured.category_reason,
      anomalies: structured.anomalies,
      ungrounded: structured.ungrounded,
      ocr: {
        provider: ocr.provider,
        providerLabel: ocr.provider_label,
        meanConfidence: ocr.mean_confidence,
        wordCount: ocr.word_count,
      },
    };
  } catch (e) {
    const message =
      e instanceof AiError
        ? e.message
        : "We couldn't organise the label text. Please retry, or enter the details manually.";
    await sb.from("extractions").insert({
      inspection_id: inspectionId,
      provider: "lovable-ai",
      input_source: "ocr_text",
      ocr_result_id: ocr.id,
      status: "failed",
      error_message: message,
      structured: {} as never,
    });
    await auditLog(sb, userId, "extraction.failed", "inspection", inspectionId, { reason: message });
    throw new Error(message);
  }
}

/** Writes declarations typed by a person (offline capture or manual entry). */
export async function writeManualDeclarations(
  sb: Sb,
  userId: string,
  inspectionId: string,
  fields: Record<string, string | null>,
) {
  const entries = Object.entries(fields).filter(([key]) => FIELD_LABELS[key]);
  if (entries.length === 0) return { written: 0 };

  const images = await loadImages(sb, inspectionId);
  const fallbackImage = images[0]?.id ?? null;

  for (const [key, raw] of entries) {
    const value = raw && raw.trim() !== "" ? raw.trim() : null;
    const { data: existing } = await sb
      .from("extracted_declarations")
      .select("id, value")
      .eq("inspection_id", inspectionId)
      .eq("field_key", key)
      .maybeSingle();
    const row = {
      inspection_id: inspectionId,
      field_key: key,
      field_label: FIELD_LABELS[key]!,
      value,
      detected: value != null,
      confidence: value != null ? 1 : 0,
      band: value != null ? "high" : "none",
      corrected: true,
      source_image_id: fallbackImage,
      original_value: existing?.value ?? null,
      original_confidence: 0,
    };
    if (existing) await sb.from("extracted_declarations").update(row).eq("id", existing.id);
    else await sb.from("extracted_declarations").insert(row as never);
  }

  await sb
    .from("extractions")
    .insert({
      inspection_id: inspectionId,
      provider: "manual",
      input_source: "manual",
      status: "success",
      raw_text: entries.map(([k, v]) => `${FIELD_LABELS[k]}: ${v ?? "-"}`).join("\n"),
      structured: { manual: true, fields } as never,
    });

  await sb.from("inspections").update({ status: "extracted" }).eq("id", inspectionId);
  await auditLog(sb, userId, "declaration.manual_entry", "inspection", inspectionId, {
    new_value: { fields: entries.map(([k]) => k) },
  });
  return { written: entries.length };
}
