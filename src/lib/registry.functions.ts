/**
 * Product registry — manufacturer authoring and authority review.
 *
 * Model: PRODUCT/SKU is the persistent identity, BATCH/LOT is a production
 * instance, and a PHYSICAL PACKAGE is an individual scanned pack. A manufacturer
 * never registers individual packages.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

import { CATEGORIES, FIELD_DEFS, FIELD_LABELS } from "./domain";

type Sb = {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, any>) => Promise<{ data: any; error: any }>;
  storage: any;
};

const uuid = z.string().uuid();
const categoryValues = CATEGORIES.map((c) => c.value) as [string, ...string[]];
const fieldKeys = FIELD_DEFS.map((f) => f.key) as [string, ...string[]];
const EVIDENCE_BUCKET = "product-evidence";

async function myManufacturerId(supabase: Sb) {
  const { data } = await supabase.rpc("my_manufacturer_id");
  return (data as string | null) ?? null;
}

/** The signed-in manufacturer's company record, created on first use. */
export const myCompany = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context as unknown as {
      supabase: Sb;
      userId: string;
      claims: Record<string, any>;
    };
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const isManufacturer = ((roles ?? []) as { role: string }[]).some((r) => r.role === "manufacturer");

    const { data: existing } = await supabase
      .from("manufacturers")
      .select("*")
      .eq("owner_id", userId)
      .maybeSingle();
    if (existing) return { company: existing, isManufacturer };
    if (!isManufacturer) return { company: null, isManufacturer };

    const email = (claims["email"] as string | undefined) ?? null;
    const { data: created } = await supabase
      .from("manufacturers")
      .insert({
        owner_id: userId,
        name: "My company",
        country: "India",
        contact_email: email,
        status: "draft",
      })
      .select("*")
      .single();
    return { company: created ?? null, isManufacturer };
  });

export const saveCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(160),
        address: z.string().trim().max(400).nullable().optional(),
        city: z.string().trim().max(80).nullable().optional(),
        state: z.string().trim().max(80).nullable().optional(),
        pincode: z.string().trim().max(12).nullable().optional(),
        gstin: z.string().trim().max(20).nullable().optional(),
        registration_no: z.string().trim().max(60).nullable().optional(),
        contact_email: z.string().trim().email().max(160).nullable().optional(),
        contact_phone: z.string().trim().max(32).nullable().optional(),
        country: z.string().trim().max(60).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { auditLog } = await import("./engine.server");
    const { data: existing } = await supabase
      .from("manufacturers")
      .select("id")
      .eq("owner_id", userId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase.from("manufacturers").update(data).eq("id", existing.id);
      if (error) throw new Error("The company details could not be saved.");
      await auditLog(supabase as never, userId, "manufacturer.updated", "manufacturer", existing.id, {
        new_value: data,
      });
      return { id: existing.id as string };
    }
    const { data: created, error } = await supabase
      .from("manufacturers")
      .insert({ ...data, owner_id: userId })
      .select("id")
      .single();
    if (error || !created) throw new Error("The company record could not be created.");
    await auditLog(supabase as never, userId, "manufacturer.created", "manufacturer", created.id, {
      new_value: data,
    });
    return { id: created.id as string };
  });

/** Products owned by the signed-in manufacturer, with barcodes and batches. */
export const myProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as unknown as { supabase: Sb };
    const manufacturerId = await myManufacturerId(supabase);
    if (!manufacturerId) return { products: [] as never[] };

    const { data: products } = await supabase
      .from("products")
      .select(
        "id, name, sku_code, category, status, declared_mrp, declared_net_quantity, country_of_origin, packer_name, importer_name, pack_type, review_note, reviewed_at, submitted_at, updated_at, created_at",
      )
      .eq("manufacturer_id", manufacturerId)
      .order("created_at", { ascending: false });

    const ids = ((products ?? []) as { id: string }[]).map((p) => p.id);
    if (ids.length === 0) return { products: [] as never[] };

    const [{ data: barcodes }, { data: batches }, { data: declarations }, { data: evidence }] =
      await Promise.all([
        supabase.from("product_barcodes").select("id, product_id, barcode, barcode_format, is_primary").in("product_id", ids),
        supabase
          .from("batches")
          .select(
            "id, product_id, batch_code, status, production_date, packing_date, expiry_date, quantity_produced, quantity_unit, declared_mrp, declared_net_quantity, notes, submitted_at, created_at",
          )
          .in("product_id", ids)
          .order("created_at", { ascending: false }),
        supabase.from("product_declarations").select("id, product_id, field_key, field_label, value").in("product_id", ids),
        supabase.from("registry_evidence").select("id, product_id, batch_id, storage_path, kind, side, caption").in("product_id", ids),
      ]);

    return {
      products: ((products ?? []) as Record<string, any>[]).map((p) => ({
        ...p,
        barcodes: ((barcodes ?? []) as { product_id: string }[]).filter((b) => b.product_id === p["id"]),
        batches: ((batches ?? []) as { product_id: string }[]).filter((b) => b.product_id === p["id"]),
        declarations: ((declarations ?? []) as { product_id: string }[]).filter((d) => d.product_id === p["id"]),
        evidence: ((evidence ?? []) as { product_id: string }[]).filter((e) => e.product_id === p["id"]),
      })),
    };
  });

export const saveProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid.optional(),
        name: z.string().trim().min(2).max(200),
        category: z.enum(categoryValues),
        sku_code: z.string().trim().max(60).nullable().optional(),
        pack_type: z.string().trim().max(60).nullable().optional(),
        packer_name: z.string().trim().max(200).nullable().optional(),
        importer_name: z.string().trim().max(200).nullable().optional(),
        country_of_origin: z.string().trim().max(60).nullable().optional(),
        declared_mrp: z.number().min(0).max(10000000).nullable().optional(),
        declared_net_quantity: z.string().trim().max(60).nullable().optional(),
        declarations: z.record(z.enum(fieldKeys), z.string().max(400).nullable()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { auditLog } = await import("./engine.server");
    const manufacturerId = await myManufacturerId(supabase);
    if (!manufacturerId)
      throw new Error("Complete your company profile before adding products to the registry.");

    const { declarations, id, ...fields } = data;
    let productId = id ?? null;

    if (productId) {
      const { data: updated, error } = await supabase
        .from("products")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", productId)
        .select("id");
      if (error || !updated || updated.length === 0)
        throw new Error("This product could not be updated. Active records may need an amendment request.");
    } else {
      const { data: created, error } = await supabase
        .from("products")
        .insert({
          ...fields,
          manufacturer_id: manufacturerId,
          created_by: userId,
          status: "draft",
        })
        .select("id")
        .single();
      if (error || !created) throw new Error("The product could not be created.");
      productId = created.id as string;
    }

    if (declarations) {
      for (const [key, raw] of Object.entries(declarations)) {
        const value = raw && raw.trim() !== "" ? raw.trim() : null;
        const { data: existing } = await supabase
          .from("product_declarations")
          .select("id")
          .eq("product_id", productId)
          .eq("field_key", key)
          .maybeSingle();
        if (existing) {
          await supabase
            .from("product_declarations")
            .update({ value, updated_at: new Date().toISOString() })
            .eq("id", existing.id);
        } else if (value != null) {
          await supabase.from("product_declarations").insert({
            product_id: productId,
            field_key: key,
            field_label: FIELD_LABELS[key] ?? key,
            value,
          });
        }
      }
    }

    await auditLog(supabase as never, userId, id ? "product.updated" : "product.created", "product", productId, {
      new_value: { ...fields, declarations: declarations ?? null },
    });
    return { id: productId };
  });

export const addBarcode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        productId: uuid,
        barcode: z.string().trim().min(6).max(64),
        format: z.string().trim().max(32).nullable().optional(),
        isPrimary: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { auditLog } = await import("./engine.server");
    const { normaliseBarcode } = await import("./domain");
    const barcode = normaliseBarcode(data.barcode);

    const { data: clash } = await supabase
      .from("product_barcodes")
      .select("product_id")
      .eq("barcode", barcode)
      .maybeSingle();
    if (clash && clash.product_id !== data.productId)
      throw new Error("This barcode is already registered to another product.");

    const { error } = await supabase.from("product_barcodes").insert({
      product_id: data.productId,
      barcode,
      barcode_format: data.format ?? null,
      is_primary: data.isPrimary ?? false,
      created_by: userId,
    });
    if (error) throw new Error("The barcode could not be added.");
    await auditLog(supabase as never, userId, "product.barcode_added", "product", data.productId, {
      new_value: { barcode },
    });
    return { ok: true as const };
  });

export const removeBarcode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ barcodeId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { auditLog } = await import("./engine.server");
    const { data: row } = await supabase
      .from("product_barcodes")
      .select("product_id, barcode")
      .eq("id", data.barcodeId)
      .maybeSingle();
    const { error } = await supabase.from("product_barcodes").delete().eq("id", data.barcodeId);
    if (error) throw new Error("The barcode could not be removed.");
    if (row)
      await auditLog(supabase as never, userId, "product.barcode_removed", "product", row.product_id, {
        previous_value: { barcode: row.barcode },
      });
    return { ok: true as const };
  });

export const submitProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ productId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { auditLog } = await import("./engine.server");
    const { notify } = await import("./notify.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: product } = await supabase
      .from("products")
      .select("id, name, status, declared_net_quantity, declared_mrp")
      .eq("id", data.productId)
      .maybeSingle();
    if (!product) throw new Error("Product not found.");
    if (!product.declared_net_quantity || product.declared_mrp == null)
      throw new Error("Register the net quantity and the retail sale price before submitting.");

    const { data: barcodes } = await supabase
      .from("product_barcodes")
      .select("id")
      .eq("product_id", data.productId)
      .limit(1);
    if (!barcodes || barcodes.length === 0)
      throw new Error("Add at least one barcode so scans can find this product.");

    const { data: updated, error } = await supabase
      .from("products")
      .update({ status: "submitted", submitted_at: new Date().toISOString() })
      .eq("id", data.productId)
      .select("id");
    if (error || !updated || updated.length === 0)
      throw new Error("This product could not be submitted for review.");

    // Registry review is done by authority administrators.
    const { data: admins } = await supabaseAdmin
      .from("authority_members")
      .select("user_id")
      .eq("member_role", "authority_admin")
      .eq("is_active", true);
    for (const a of ((admins ?? []) as { user_id: string }[]).slice(0, 50)) {
      await notify(a.user_id, {
        kind: "registry_review",
        title: `Registry submission — ${product.name}`,
        body: "A manufacturer has submitted a product record for registry review.",
        link: "/authority",
        entity: "product",
        entityId: data.productId,
      });
    }

    await auditLog(supabase as never, userId, "product.submitted", "product", data.productId, {
      new_value: { status: "submitted" },
    });
    return { ok: true as const };
  });

export const saveBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid.optional(),
        productId: uuid,
        batch_code: z.string().trim().min(2).max(60),
        production_date: z.string().date().nullable().optional(),
        packing_date: z.string().date().nullable().optional(),
        expiry_date: z.string().date().nullable().optional(),
        quantity_produced: z.number().min(0).max(1e9).nullable().optional(),
        quantity_unit: z.string().trim().max(20).nullable().optional(),
        declared_mrp: z.number().min(0).max(1e7).nullable().optional(),
        declared_net_quantity: z.string().trim().max(60).nullable().optional(),
        notes: z.string().trim().max(1000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { auditLog } = await import("./engine.server");
    const { id, productId, ...fields } = data;

    if (id) {
      const { data: updated, error } = await supabase
        .from("batches")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("id");
      if (error || !updated || updated.length === 0) throw new Error("The batch could not be updated.");
      await auditLog(supabase as never, userId, "batch.updated", "batch", id, { new_value: fields });
      return { id };
    }
    const { data: created, error } = await supabase
      .from("batches")
      .insert({ ...fields, product_id: productId, created_by: userId, status: "draft" })
      .select("id")
      .single();
    if (error || !created) throw new Error("The batch could not be created.");
    await auditLog(supabase as never, userId, "batch.created", "batch", created.id, {
      new_value: { ...fields, product_id: productId },
    });
    return { id: created.id as string };
  });

export const submitBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ batchId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { auditLog } = await import("./engine.server");

    const { data: updated, error } = await supabase
      .from("batches")
      .update({ status: "submitted", submitted_at: new Date().toISOString() })
      .eq("id", data.batchId)
      .select("id, batch_code, product_id");
    if (error || !updated || updated.length === 0) throw new Error("The batch could not be submitted.");
    await auditLog(supabase as never, userId, "batch.submitted", "batch", data.batchId, {
      new_value: { status: "submitted", batch_code: updated[0]!.batch_code },
    });
    return { ok: true as const };
  });

/** Registers an evidence image the browser has already uploaded to storage. */
export const registerEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        productId: uuid,
        batchId: uuid.nullable().optional(),
        storagePath: z.string().trim().min(6).max(400),
        kind: z.enum(["label", "package", "batch", "certificate"]),
        side: z.string().trim().max(32).nullable().optional(),
        caption: z.string().trim().max(200).nullable().optional(),
        width: z.number().int().min(0).max(20000).nullable().optional(),
        height: z.number().int().min(0).max(20000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    if (!data.storagePath.startsWith(`${userId}/`))
      throw new Error("Evidence must be uploaded to your own folder.");
    const { error } = await supabase.from("registry_evidence").insert({
      product_id: data.productId,
      batch_id: data.batchId ?? null,
      storage_path: data.storagePath,
      kind: data.kind,
      side: data.side ?? null,
      caption: data.caption ?? null,
      width: data.width ?? null,
      height: data.height ?? null,
      uploaded_by: userId,
    });
    if (error) throw new Error("The evidence could not be registered.");
    return { ok: true as const };
  });

/** Signed URLs for registry evidence the caller is allowed to read. */
export const evidenceUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ productId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as unknown as { supabase: Sb };
    const { data: rows } = await supabase
      .from("registry_evidence")
      .select("id, storage_path, kind, side, caption, batch_id")
      .eq("product_id", data.productId);
    const out: { id: string; url: string; kind: string; side: string | null; caption: string | null }[] = [];
    for (const row of (rows ?? []) as Record<string, string | null>[]) {
      const { data: signed } = await supabase.storage
        .from(EVIDENCE_BUCKET)
        .createSignedUrl(row["storage_path"]!, 900);
      if (signed?.signedUrl)
        out.push({
          id: row["id"]!,
          url: signed.signedUrl,
          kind: row["kind"] ?? "label",
          side: row["side"] ?? null,
          caption: row["caption"] ?? null,
        });
    }
    return { evidence: out };
  });

// ---------------------------------------------------------------------------
// Authority side of the registry
// ---------------------------------------------------------------------------

export const registrySubmissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as unknown as { supabase: Sb };
    const { data: products } = await supabase
      .from("products")
      .select(
        "id, name, sku_code, category, status, declared_mrp, declared_net_quantity, country_of_origin, packer_name, importer_name, submitted_at, review_note, manufacturer_id",
      )
      .in("status", ["submitted", "active", "suspended", "rejected"])
      .order("submitted_at", { ascending: false })
      .limit(200);

    const ids = ((products ?? []) as { id: string; manufacturer_id: string | null }[]).map((p) => p.id);
    const mIds = [
      ...new Set(
        ((products ?? []) as { manufacturer_id: string | null }[])
          .map((p) => p.manufacturer_id)
          .filter((v): v is string => !!v),
      ),
    ];
    const [{ data: barcodes }, { data: manufacturers }, { data: batches }] = await Promise.all([
      ids.length
        ? supabase.from("product_barcodes").select("product_id, barcode").in("product_id", ids)
        : Promise.resolve({ data: [] }),
      mIds.length
        ? supabase.from("manufacturers").select("id, name, city, state").in("id", mIds)
        : Promise.resolve({ data: [] }),
      ids.length
        ? supabase.from("batches").select("id, product_id, batch_code, status").in("product_id", ids)
        : Promise.resolve({ data: [] }),
    ]);

    return {
      products: ((products ?? []) as Record<string, any>[]).map((p) => ({
        ...p,
        barcodes: ((barcodes ?? []) as { product_id: string; barcode: string }[])
          .filter((b) => b.product_id === p["id"])
          .map((b) => b.barcode),
        manufacturer:
          ((manufacturers ?? []) as { id: string }[]).find((m) => m.id === p["manufacturer_id"]) ?? null,
        batches: ((batches ?? []) as { product_id: string }[]).filter((b) => b.product_id === p["id"]),
      })),
    };
  });

export const decideProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        productId: uuid,
        decision: z.enum(["active", "rejected", "suspended"]),
        note: z.string().trim().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { auditLog } = await import("./engine.server");
    const { notifyManufacturerOwner } = await import("./notify.server");

    const { data: before } = await supabase
      .from("products")
      .select("status, name, manufacturer_id")
      .eq("id", data.productId)
      .maybeSingle();

    const { data: updated, error } = await supabase
      .from("products")
      .update({
        status: data.decision,
        review_note: data.note ?? null,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.productId)
      .select("id");
    if (error || !updated || updated.length === 0)
      throw new Error("Only an authority administrator may decide a registry submission.");

    await notifyManufacturerOwner((before?.manufacturer_id as string | null) ?? null, {
      kind: "registry_decision",
      title: `Registry decision — ${before?.name ?? "product"}`,
      body:
        data.decision === "active"
          ? "Your product record is now active in the registry."
          : `Your product record was marked “${data.decision}”.${data.note ? ` Note: ${data.note}` : ""}`,
      link: "/manufacturer",
      entity: "product",
      entityId: data.productId,
    });
    await auditLog(supabase as never, userId, "product.reviewed", "product", data.productId, {
      previous_value: { status: before?.status ?? null },
      new_value: { status: data.decision },
      ...(data.note ? { reason: data.note } : {}),
    });
    return { ok: true as const };
  });

export const createAuthorityRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        manufacturerId: uuid.nullable().optional(),
        productId: uuid.nullable().optional(),
        batchId: uuid.nullable().optional(),
        inspectionId: uuid.nullable().optional(),
        subject: z.string().trim().min(4).max(160),
        message: z.string().trim().min(10).max(4000),
        dueDate: z.string().date().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { auditLog } = await import("./engine.server");
    const { notifyManufacturerOwner } = await import("./notify.server");

    const { data: authority } = await supabase.rpc("my_authority_id");
    const { data: created, error } = await supabase
      .from("authority_requests")
      .insert({
        authority_id: (authority as string | null) ?? null,
        manufacturer_id: data.manufacturerId ?? null,
        product_id: data.productId ?? null,
        batch_id: data.batchId ?? null,
        inspection_id: data.inspectionId ?? null,
        subject: data.subject,
        message: data.message,
        due_date: data.dueDate ?? null,
        status: "open",
        created_by: userId,
      })
      .select("id, request_code")
      .single();
    if (error || !created) throw new Error("The request could not be raised.");

    await notifyManufacturerOwner(data.manufacturerId ?? null, {
      kind: "manufacturer_request",
      title: `Authority request — ${data.subject}`,
      body: data.message.slice(0, 400),
      link: "/manufacturer",
      entity: "authority_request",
      entityId: created.id as string,
    });
    await auditLog(supabase as never, userId, "authority_request.created", "authority_request", created.id, {
      new_value: { subject: data.subject, product_id: data.productId ?? null },
      authority_id: (authority as string | null) ?? null,
    });
    return { id: created.id as string, code: created.request_code as string };
  });

export const myAuthorityRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as unknown as { supabase: Sb };
    const { data } = await supabase
      .from("authority_requests")
      .select(
        "id, request_code, subject, message, status, due_date, created_at, updated_at, product_id, batch_id, inspection_id, manufacturer_id",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    return { requests: data ?? [] };
  });

export const respondToAuthorityRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ requestId: uuid, response: z.string().trim().min(5).max(4000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { auditLog } = await import("./engine.server");
    const { notifyAuthorityStaff } = await import("./notify.server");

    const { data: request } = await supabase
      .from("authority_requests")
      .select("id, subject, authority_id, status")
      .eq("id", data.requestId)
      .maybeSingle();
    if (!request) throw new Error("Request not found.");

    const { data: updated, error } = await supabase
      .from("authority_requests")
      .update({ status: "answered", updated_at: new Date().toISOString() })
      .eq("id", data.requestId)
      .select("id");
    if (error || !updated || updated.length === 0)
      throw new Error("The response could not be recorded for this request.");

    await auditLog(supabase as never, userId, "authority_request.answered", "authority_request", data.requestId, {
      new_value: { response: data.response },
      authority_id: (request.authority_id as string | null) ?? null,
    });
    await notifyAuthorityStaff((request.authority_id as string | null) ?? null, ["authority_admin", "supervisor"], {
      kind: "manufacturer_request",
      title: `Response received — ${request.subject}`,
      body: data.response.slice(0, 400),
      link: "/authority",
      entity: "authority_request",
      entityId: data.requestId,
    });
    return { ok: true as const };
  });
