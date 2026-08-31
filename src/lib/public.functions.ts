/**
 * Public, no-account surfaces: barcode lookup, package check, complaints.
 *
 * These endpoints are deliberately limited. A visitor sees registry facts that
 * a manufacturer chose to publish and a PRELIMINARY reading of their own photo.
 * They never see inspections, internal notes, officers, or rule administration,
 * and the result is always labelled as consumer information rather than an
 * official finding.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { CATEGORIES } from "./domain";
import type { EvaluatedCheck, Summary } from "./rule-engine";


const categoryValues = CATEGORIES.map((c) => c.value) as [string, ...string[]];

const PUBLIC_DISCLAIMER =
  "This is a preliminary consumer check, not an official government inspection. It reads the photograph you supplied and compares it with what the manufacturer registered. Only a Legal Metrology officer can decide whether a package complies with the law.";

/** Registry identity lookup for a barcode. Rate limited per caller. */
export const publicBarcodeLookup = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ barcode: z.string().trim().min(4).max(64) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { publicSupabase, callerFingerprint, rateLimit } = await import("./public.server");
    const { normaliseBarcode } = await import("./domain");

    const who = await callerFingerprint();
    const limit = await rateLimit("public_lookup", who, 60, 600);
    if (!limit.allowed) return { rateLimited: true as const, message: limit.message, product: null };

    const barcode = normaliseBarcode(data.barcode);
    const sb = publicSupabase();
    const { data: payload } = await sb.rpc("public_barcode_lookup", { _barcode: barcode });
    if (!payload) {
      return {
        rateLimited: false as const,
        message:
          "This barcode is not in the product registry. Registration is voluntary, so an absent record does not mean anything is wrong with the pack.",
        product: null,
      };
    }
    const p = payload as Record<string, any>;
    return {
      rateLimited: false as const,
      message: null,
      product: {
        name: p["name"] as string,
        sku_code: (p["sku_code"] as string | null) ?? null,
        category: p["category"] as string,
        declared_mrp: p["declared_mrp"] ?? null,
        declared_net_quantity: (p["declared_net_quantity"] as string | null) ?? null,
        country_of_origin: (p["country_of_origin"] as string | null) ?? null,
        manufacturer_name: (p["manufacturer_name"] as string | null) ?? null,
        manufacturer_address: (p["manufacturer_address"] as string | null) ?? null,
        packer_name: (p["packer_name"] as string | null) ?? null,
        importer_name: (p["importer_name"] as string | null) ?? null,
        barcode: (p["barcode"] as string | null) ?? barcode,
        batch_count: Array.isArray(p["batches"]) ? (p["batches"] as unknown[]).length : 0,
      },
    };
  });

/**
 * Public package check: real OCR on the visitor's own photographs, AI field
 * mapping, registry comparison and a preliminary rule reading.
 */
export const publicPackageCheck = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        barcode: z.string().trim().max(64).nullable().optional(),
        category: z.enum(categoryValues).nullable().optional(),
        images: z
          .array(
            z.object({
              base64: z.string().min(100).max(4_800_000),
              side: z.enum(["front", "back", "side", "top_bottom", "declaration"]),
            }),
          )
          .min(1)
          .max(3),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { publicSupabase, callerFingerprint, rateLimit, decodeImage, base64ToBytes } = await import(
      "./public.server"
    );
    const { runGoogleVisionOcr, ocrConfigStatus } = await import("./ocr.server");
    const { structureFromOcr, AiError } = await import("./ai.server");
    const { compareWithRegistry } = await import("./registry");
    const { registryByBarcode } = await import("./registry.server");
    const { evaluateRules, summarise } = await import("./rule-engine");
    const { normaliseBarcode } = await import("./domain");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const who = await callerFingerprint();
    const limit = await rateLimit("public_check", who, 12, 3600);
    if (!limit.allowed) throw new Error(limit.message);

    const decoded = data.images.map((img) => ({ ...decodeImage(img.base64), side: img.side }));
    const barcode = data.barcode ? normaliseBarcode(data.barcode) : null;

    const config = ocrConfigStatus();
    const ocr = await runGoogleVisionOcr(decoded.map((d) => ({ content: d.base64, side: d.side })));

    const sb = publicSupabase();
    const product = barcode ? await registryByBarcode(sb as never, barcode) : null;

    // Store the scan and its evidence so authorities can see mismatch signals.
    const token = crypto.randomUUID();
    const paths: string[] = [];
    for (const [index, img] of decoded.entries()) {
      const path = `public/${token}/${index}-${img.side}.jpg`;
      const { error } = await supabaseAdmin.storage
        .from("public-scan-evidence")
        .upload(path, base64ToBytes(img.base64), { contentType: "image/jpeg", upsert: true });
      if (!error) paths.push(path);
    }

    if (ocr.status !== "succeeded") {
      const { data: scan } = await supabaseAdmin
        .from("package_scans")
        .insert({
          source: "public",
          barcode,
          product_id: product?.id ?? null,
          category: data.category ?? null,
          observed: {} as never,
          assessment: { ocr_status: ocr.status, error: ocr.error } as never,
          registry_match: product ? "insufficient_evidence" : barcode ? "barcode_unknown" : "barcode_absent",
          ocr_provider: ocr.provider,
          ocr_status: ocr.status === "not_configured" ? "not_configured" : "failed",
          image_path: paths[0] ?? null,
        })
        .select("id, scan_code")
        .single();
      if (scan) await supabaseAdmin.from("ocr_results").insert({
        package_scan_id: scan.id,
        provider: ocr.provider,
        provider_label: ocr.providerLabel,
        model: ocr.model,
        status: ocr.status === "not_configured" ? "not_configured" : "failed",
        blocks: [] as never,
        error_message: ocr.error,
        duration_ms: ocr.durationMs,
      });

      return {
        scanCode: (scan?.scan_code as string | undefined) ?? null,
        ocr: {
          status: ocr.status,
          provider: ocr.providerLabel,
          message:
            ocr.status === "not_configured"
              ? config.message
              : (ocr.error ?? "The text on this package could not be read."),
          meanConfidence: null,
          wordCount: 0,
        },
        product: product
          ? {
              name: product.name,
              manufacturer_name: product.manufacturer_name,
              declared_mrp: product.declared_mrp,
              declared_net_quantity: product.declared_net_quantity,
              category: product.category,
            }
          : null,
        declarations: [] as { field_key: string; label: string; value: string | null; confidence: number }[],
        registry: null,
        assessment: null,
        disclaimer: PUBLIC_DISCLAIMER,
      };
    }

    let structured;
    try {
      structured = await structureFromOcr({ ocrText: ocr.rawText, blocks: ocr.blocks });
    } catch (e) {
      throw new Error(
        e instanceof AiError
          ? e.message
          : "The label text was read, but it could not be organised. Please try again.",
      );
    }

    const observed: Record<string, { value: string | null; confidence: number }> = {};
    for (const [key, field] of Object.entries(structured.fields)) {
      observed[key] = { value: field.value, confidence: field.confidence };
    }

    const comparison = compareWithRegistry({ product, observed: observed as never, barcode });
    const category = data.category ?? structured.category_guess ?? product?.category ?? "other";

    // Preliminary rule reading — evaluated in memory, never stored as an
    // official compliance result.
    const { data: version } = await sb
      .from("rule_versions")
      .select("id, version_label, source_document")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    let checks: EvaluatedCheck[] = [];
    let summary: Summary | null = null;
    if (version) {
      const { data: rules } = await sb
        .from("rule_definitions")
        .select("*")
        .eq("rule_version_id", version.id)
        .eq("is_active", true)
        .order("display_order");
      const declarationRows = Object.entries(structured.fields).map(([key, field]) => ({
        field_key: key,
        value: field.value,
        confidence: field.confidence,
        detected: field.detected,
        source_image_id: null,
      }));
      const evaluated = evaluateRules((rules ?? []) as never, declarationRows, {
        category,
        hasImages: true,
        hasExtraction: true,
        registry: product
          ? {
              match: comparison.match,
              headline: comparison.headline,
              differing: comparison.differing.map((d) => ({
                label: d.label,
                registry_value: d.registry_value,
                observed_value: d.observed_value,
              })),
              comparedCount: comparison.comparedCount,
            }
          : null,
      });
      checks = evaluated.checks;
      summary = summarise(checks);
    }


    const { data: scan } = await supabaseAdmin
      .from("package_scans")
      .insert({
        source: "public",
        barcode,
        product_id: product?.id ?? null,
        batch_id: comparison.matchedBatch?.id ?? null,
        category,
        observed: observed as never,
        assessment: {
          preliminary: true,
          overall: summary?.overall ?? null,
          score: summary?.score ?? null,
          pass: summary?.pass ?? 0,
          fail: summary?.fail ?? 0,
          needs_review: summary?.needs_review ?? 0,
          registry_headline: comparison.headline,
        } as never,

        registry_match: comparison.match,
        mismatch_notes: comparison.differing.length ? comparison.headline : null,
        ocr_provider: ocr.provider,
        ocr_status: "succeeded",
        image_path: paths[0] ?? null,
      })
      .select("id, scan_code")
      .single();

    if (scan) {
      await supabaseAdmin.from("ocr_results").insert({
        package_scan_id: scan.id,
        provider: ocr.provider,
        provider_label: ocr.providerLabel,
        model: ocr.model,
        status: "succeeded",
        raw_text: ocr.rawText,
        blocks: ocr.blocks as never,
        mean_confidence: ocr.meanConfidence,
        word_count: ocr.wordCount,
        duration_ms: ocr.durationMs,
      });
    }

    return {
      scanCode: (scan?.scan_code as string | undefined) ?? null,
      scanId: (scan?.id as string | undefined) ?? null,
      ocr: {
        status: "succeeded" as const,
        provider: ocr.providerLabel,
        message: null,
        meanConfidence: ocr.meanConfidence,
        wordCount: ocr.wordCount,
      },
      product: product
        ? {
            name: product.name,
            manufacturer_name: product.manufacturer_name,
            declared_mrp: product.declared_mrp,
            declared_net_quantity: product.declared_net_quantity,
            category: product.category,
            country_of_origin: product.country_of_origin,
          }
        : null,
      declarations: Object.entries(structured.fields)
        .filter(([, f]) => f.value != null)
        .map(([key, f]) => ({
          field_key: key,
          label: key,
          value: f.value,
          confidence: f.confidence,
        })),
      missing: Object.entries(structured.fields)
        .filter(([, f]) => f.value == null)
        .map(([key]) => key),
      anomalies: structured.anomalies,
      categoryGuess: structured.category_guess,
      registry: {
        match: comparison.match,
        headline: comparison.headline,
        differing: comparison.differing.map((d) => ({
          label: d.label,
          registry_value: d.registry_value,
          observed_value: d.observed_value,
          detail: d.detail,
        })),
      },
      assessment: {
        overall: summary?.overall ?? null,
        score: summary?.score ?? null,
        total: summary?.total ?? 0,
        counts: {
          pass: summary?.pass ?? 0,
          fail: summary?.fail ?? 0,
          needs_review: summary?.needs_review ?? 0,
          unable_to_verify: summary?.unable_to_verify ?? 0,
          manual: summary?.manual ?? 0,
          not_applicable: summary?.not_applicable ?? 0,
        },
        items: checks
          .filter((c) => c.result !== "not_applicable")
          .map((c) => ({
            rule_number: c.rule_number,
            title: c.title,
            result: c.result,
            explanation: c.explanation,
            detected_value: c.detected_value,
            source_section: c.source_section,
            source_page: c.source_page,
          })),
        rule_version: version?.version_label ?? null,
        source_document: version?.source_document ?? null,
      },

      disclaimer: PUBLIC_DISCLAIMER,
    };
  });

/** Anyone may report a suspected labelling problem, with or without an account. */
export const submitPublicComplaint = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        productName: z.string().trim().min(2).max(200),
        manufacturerName: z.string().trim().max(200).nullable().optional(),
        barcode: z.string().trim().max(64).nullable().optional(),
        description: z.string().trim().min(20).max(4000),
        guestName: z.string().trim().max(120).nullable().optional(),
        guestEmail: z.string().trim().email().max(160).nullable().optional(),
        region: z.string().trim().max(120).nullable().optional(),
        latitude: z.number().min(-90).max(90).nullable().optional(),
        longitude: z.number().min(-180).max(180).nullable().optional(),
        imageBase64: z.string().max(4_800_000).nullable().optional(),
        packageScanId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { callerFingerprint, rateLimit, decodeImage, base64ToBytes, randomToken } = await import(
      "./public.server"
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { notify } = await import("./notify.server");
    const { normaliseBarcode } = await import("./domain");

    const who = await callerFingerprint();
    const limit = await rateLimit("public_complaint", who, 5, 3600);
    if (!limit.allowed) throw new Error(limit.message);

    const token = randomToken(14);
    let imagePath: string | null = null;
    if (data.imageBase64) {
      const img = decodeImage(data.imageBase64);
      const path = `public/${token}/evidence.jpg`;
      const { error } = await supabaseAdmin.storage
        .from("complaint-evidence")
        .upload(path, base64ToBytes(img.base64), { contentType: "image/jpeg", upsert: true });
      if (!error) imagePath = path;
    }

    // Advisory AI triage. It may never decide, close or reject a complaint.
    let triage: Record<string, any> | null = null;
    try {
      const { triageComplaint } = await import("./ai.server");
      const result = await triageComplaint({
        productName: data.productName,
        manufacturer: data.manufacturerName ?? null,
        description: data.description,
        hasImage: !!imagePath,
      });
      triage = { ...result, advisory: true };
    } catch (e) {
      triage = { advisory: true, unavailable: (e as Error).message.slice(0, 200) };
    }

    let productId: string | null = null;
    if (data.barcode) {
      const { data: link } = await supabaseAdmin
        .from("product_barcodes")
        .select("product_id")
        .eq("barcode", normaliseBarcode(data.barcode))
        .maybeSingle();
      productId = (link?.product_id as string | null) ?? null;
    }

    const priority = (triage?.["suggested_priority"] as string | undefined) ?? "normal";
    const { data: complaint, error } = await supabaseAdmin
      .from("complaints")
      .insert({
        product_name: data.productName,
        manufacturer_name: data.manufacturerName ?? null,
        barcode: data.barcode ? normaliseBarcode(data.barcode) : null,
        description: data.description,
        image_path: imagePath,
        guest_name: data.guestName ?? null,
        guest_email: data.guestEmail ?? null,
        tracking_token: token,
        source: "public",
        package_scan_id: data.packageScanId ?? null,
        product_id: productId,
        priority: ["low", "normal", "high"].includes(priority) ? priority : "normal",
        ai_classification: triage as never,
        region: data.region ?? null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        category: (triage?.["suggested_category"] as string | null) ?? null,
        status: "submitted",
      })
      .select("id, complaint_code")
      .single();
    if (error || !complaint) {
      console.error("[public] complaint insert failed", error);
      throw new Error("The complaint could not be recorded. Please try again.");
    }

    await supabaseAdmin.from("complaint_updates").insert({
      complaint_id: complaint.id,
      status: "submitted",
      note: "Complaint received and queued for triage by an officer.",
      is_public: true,
    });

    const { data: staff } = await supabaseAdmin
      .from("authority_members")
      .select("user_id, member_role")
      .eq("is_active", true)
      .in("member_role", ["authority_admin", "supervisor"]);
    for (const s of ((staff ?? []) as { user_id: string }[]).slice(0, 50)) {
      await notify(s.user_id, {
        kind: "complaint_new",
        title: `New complaint — ${complaint.complaint_code}`,
        body: data.description.slice(0, 300),
        link: "/complaints",
        entity: "complaint",
        entityId: complaint.id as string,
      });
    }

    await supabaseAdmin.from("audit_logs").insert({
      action: "complaint.submitted_public",
      entity: "complaint",
      entity_id: complaint.id as string,
      new_value: { complaint_code: complaint.complaint_code, has_image: !!imagePath } as never,
    });

    return {
      code: complaint.complaint_code as string,
      trackingToken: token,
      message:
        "Your report has been recorded. Keep the tracking code — you can follow the status without creating an account.",
    };
  });

export const trackPublicComplaint = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().trim().min(6).max(40) }).parse(d))
  .handler(async ({ data }) => {
    const { publicSupabase, callerFingerprint, rateLimit } = await import("./public.server");
    const who = await callerFingerprint();
    const limit = await rateLimit("public_track", who, 40, 3600);
    if (!limit.allowed) throw new Error(limit.message);

    const sb = publicSupabase();
    const { data: payload } = await sb.rpc("track_complaint", { _token: data.token });
    if (!payload) return { complaint: null };
    return { complaint: payload as Record<string, any> };
  });
