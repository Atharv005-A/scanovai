/**
 * Retail / billing-counter workflow.
 *
 * A cashier scans a barcode and gets a fast registry answer. It is an
 * information signal, never an enforcement decision: the workflow never claims
 * a product is illegal and never blocks a sale by itself. "Hold for review" is
 * an optional business action the shop chooses to take.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Sb = {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, any>) => Promise<{ data: any; error: any }>;
};

const uuid = z.string().uuid();

async function assertRetailer(supabase: Sb, userId: string) {
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const list = ((roles ?? []) as { role: string }[]).map((r) => r.role);
  if (!list.some((r) => ["retailer", "inspector", "supervisor", "authority_admin", "system_admin"].includes(r)))
    throw new Error("The billing counter is available to retailer accounts.");
  return list;
}

export const openRetailSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        storeName: z.string().trim().max(160).nullable().optional(),
        locationLabel: z.string().trim().max(160).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    await assertRetailer(supabase, userId);

    const { data: open } = await supabase
      .from("retail_sessions")
      .select("id, store_name, location_label, opened_at")
      .eq("retailer_id", userId)
      .is("closed_at", null)
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (open) return { session: open, reused: true as const };

    const { data: created, error } = await supabase
      .from("retail_sessions")
      .insert({
        retailer_id: userId,
        store_name: data.storeName ?? null,
        location_label: data.locationLabel ?? null,
      })
      .select("id, store_name, location_label, opened_at")
      .single();
    if (error || !created) throw new Error("The counter session could not be opened.");
    return { session: created, reused: false as const };
  });

export const closeRetailSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sessionId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as unknown as { supabase: Sb };
    const { error } = await supabase
      .from("retail_sessions")
      .update({ closed_at: new Date().toISOString() })
      .eq("id", data.sessionId);
    if (error) throw new Error("The counter session could not be closed.");
    return { ok: true as const };
  });

/** One counter scan: registry lookup plus an aggregated anomaly signal. */
export const retailScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        barcode: z.string().trim().min(4).max(64),
        sessionId: uuid.nullable().optional(),
        barcodeFormat: z.string().trim().max(32).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    await assertRetailer(supabase, userId);
    const { rateLimit } = await import("./public.server");
    const { registryByBarcode, recentMismatchCount, hasOpenReview } = await import("./registry.server");
    const { retailAlertFor } = await import("./registry");
    const { normaliseBarcode } = await import("./domain");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const limit = await rateLimit("retail_scan", userId, 600, 3600);
    if (!limit.allowed) throw new Error(limit.message);

    const barcode = normaliseBarcode(data.barcode);
    if (!barcode) throw new Error("That barcode does not look valid.");
    const product = await registryByBarcode(supabase, barcode);

    let recentMismatches = 0;
    let openReview = false;
    if (product) {
      [recentMismatches, openReview] = await Promise.all([
        recentMismatchCount(supabaseAdmin as never, product.id),
        hasOpenReview(supabaseAdmin as never, product.id),
      ]);
    }

    const { alert, reason } = retailAlertFor({ product, openReview, recentMismatches });

    const { data: scan } = await supabaseAdmin
      .from("package_scans")
      .insert({
        source: "retail",
        scanned_by: userId,
        barcode,
        barcode_format: data.barcodeFormat ?? null,
        product_id: product?.id ?? null,
        category: product?.category ?? null,
        observed: {} as never,
        assessment: { alert, reason, recent_mismatches: recentMismatches } as never,
        registry_match: product ? "product_found_batch_unknown" : "barcode_unknown",
        ocr_status: "skipped",
      })
      .select("id")
      .single();

    const { data: retailScanRow } = await supabase
      .from("retail_scans")
      .insert({
        session_id: data.sessionId ?? null,
        retailer_id: userId,
        barcode,
        product_id: product?.id ?? null,
        package_scan_id: (scan?.id as string | undefined) ?? null,
        alert,
        note: reason,
      })
      .select("id, created_at")
      .single();

    return {
      scanId: (retailScanRow?.id as string | undefined) ?? null,
      alert,
      reason,
      recentMismatches,
      product: product
        ? {
            id: product.id,
            name: product.name,
            sku_code: product.sku_code,
            category: product.category,
            declared_mrp: product.declared_mrp,
            declared_net_quantity: product.declared_net_quantity,
            manufacturer_name: product.manufacturer_name,
            batches: product.batches.map((b) => ({ batch_code: b.batch_code, status: b.status })),
          }
        : null,
      guidance:
        "This is registry information only. It is not a legal finding and it does not authorise refusing a sale.",
    };
  });

export const holdForReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ scanId: uuid, note: z.string().trim().max(500).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { auditLog } = await import("./engine.server");
    const { error } = await supabase
      .from("retail_scans")
      .update({ held_for_review: true, note: data.note ?? null })
      .eq("id", data.scanId)
      .eq("retailer_id", userId);
    if (error) throw new Error("The item could not be held for review.");
    await auditLog(supabase as never, userId, "retail.held_for_review", "retail_scan", data.scanId, {
      ...(data.note ? { reason: data.note } : {}),
    });
    return { ok: true as const };
  });

export const recentRetailScans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { data: scans } = await supabase
      .from("retail_scans")
      .select("id, barcode, alert, held_for_review, note, created_at, product_id, session_id")
      .eq("retailer_id", userId)
      .order("created_at", { ascending: false })
      .limit(60);

    const productIds = [
      ...new Set(
        ((scans ?? []) as { product_id: string | null }[])
          .map((s) => s.product_id)
          .filter((v): v is string => !!v),
      ),
    ];
    const { data: products } = productIds.length
      ? await supabase.from("products").select("id, name, category").in("id", productIds)
      : { data: [] };

    const byId = new Map(((products ?? []) as { id: string; name: string }[]).map((p) => [p.id, p]));
    return {
      scans: ((scans ?? []) as Record<string, any>[]).map((s) => ({
        ...s,
        product: s["product_id"] ? (byId.get(s["product_id"] as string) ?? null) : null,
      })),
    };
  });
