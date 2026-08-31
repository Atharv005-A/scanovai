/** Server-only registry reads. */

import type { FieldKey } from "./domain";
import type { RegistryProduct } from "./registry";

type Sb = {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

interface LookupPayload {
  product_id: string;
  name: string;
  sku_code: string | null;
  category: string;
  declared_mrp: number | string | null;
  declared_net_quantity: string | null;
  country_of_origin: string | null;
  packer_name: string | null;
  importer_name: string | null;
  manufacturer_name: string | null;
  manufacturer_address: string | null;
  manufacturer_country: string | null;
  barcode: string | null;
  barcode_format: string | null;
  declarations: Record<string, string | null> | null;
  batches:
    | {
        id: string;
        batch_code: string;
        production_date: string | null;
        packing_date: string | null;
        declared_mrp: number | string | null;
        declared_net_quantity: string | null;
        status: string;
      }[]
    | null;
}

const numeric = (v: number | string | null | undefined) =>
  v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;

function fromLookup(p: LookupPayload): RegistryProduct {
  return {
    id: p.product_id,
    sku_code: p.sku_code,
    name: p.name,
    category: p.category,
    status: "active",
    manufacturer_id: null,
    manufacturer_name: p.manufacturer_name,
    packer_name: p.packer_name,
    importer_name: p.importer_name,
    country_of_origin: p.country_of_origin,
    declared_mrp: numeric(p.declared_mrp),
    declared_net_quantity: p.declared_net_quantity,
    declarations: {
      ...((p.declarations ?? {}) as Partial<Record<FieldKey, string | null>>),
      manufacturer_address: p.manufacturer_address ?? (p.declarations ?? {})["manufacturer_address"] ?? null,
    },
    barcodes: p.barcode ? [p.barcode] : [],
    batches: (p.batches ?? []).map((b) => ({
      id: b.id,
      batch_code: b.batch_code,
      status: b.status,
      production_date: b.production_date,
      packing_date: b.packing_date,
      quantity_produced: null,
      declared_mrp: numeric(b.declared_mrp),
      declared_net_quantity: b.declared_net_quantity,
      notes: null,
    })),
    evidence_count: 0,
    updated_at: null,
  };
}

/**
 * Public/identity lookup. Uses the security-definer function so the caller
 * only ever sees the safe, column-limited projection of an ACTIVE product.
 */
export async function registryByBarcode(sb: Sb, barcode: string): Promise<RegistryProduct | null> {
  const { data, error } = await sb.rpc("public_barcode_lookup", { _barcode: barcode });
  if (error || !data) return null;
  return fromLookup(data as LookupPayload);
}

/** Full record for the owner or government staff, including non-active states. */
export async function registryByProductId(sb: Sb, productId: string): Promise<RegistryProduct | null> {
  const { data: product } = await sb
    .from("products")
    .select(
      "id, sku_code, name, category, status, manufacturer_id, packer_name, importer_name, country_of_origin, declared_mrp, declared_net_quantity, updated_at",
    )
    .eq("id", productId)
    .maybeSingle();
  if (!product) return null;

  const [{ data: barcodes }, { data: declarations }, { data: batches }, { data: evidence }, { data: manufacturer }] =
    await Promise.all([
      sb.from("product_barcodes").select("barcode, is_primary").eq("product_id", productId),
      sb.from("product_declarations").select("field_key, value").eq("product_id", productId),
      sb
        .from("batches")
        .select(
          "id, batch_code, status, production_date, packing_date, quantity_produced, declared_mrp, declared_net_quantity, notes",
        )
        .eq("product_id", productId)
        .order("created_at", { ascending: false }),
      sb.from("registry_evidence").select("id").eq("product_id", productId),
      product.manufacturer_id
        ? sb.from("manufacturers").select("name, address").eq("id", product.manufacturer_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const decl: Partial<Record<FieldKey, string | null>> = {};
  for (const d of (declarations ?? []) as { field_key: string; value: string | null }[]) {
    decl[d.field_key as FieldKey] = d.value;
  }
  if (manufacturer?.address && !decl.manufacturer_address) decl.manufacturer_address = manufacturer.address;

  return {
    id: product.id,
    sku_code: product.sku_code,
    name: product.name,
    category: product.category,
    status: product.status,
    manufacturer_id: product.manufacturer_id,
    manufacturer_name: manufacturer?.name ?? null,
    packer_name: product.packer_name,
    importer_name: product.importer_name,
    country_of_origin: product.country_of_origin,
    declared_mrp: numeric(product.declared_mrp),
    declared_net_quantity: product.declared_net_quantity,
    declarations: decl,
    barcodes: ((barcodes ?? []) as { barcode: string }[]).map((b) => b.barcode),
    batches: ((batches ?? []) as Record<string, unknown>[]).map((b) => ({
      id: b["id"] as string,
      batch_code: b["batch_code"] as string,
      status: b["status"] as string,
      production_date: (b["production_date"] as string | null) ?? null,
      packing_date: (b["packing_date"] as string | null) ?? null,
      quantity_produced: numeric(b["quantity_produced"] as number | null),
      declared_mrp: numeric(b["declared_mrp"] as number | null),
      declared_net_quantity: (b["declared_net_quantity"] as string | null) ?? null,
      notes: (b["notes"] as string | null) ?? null,
    })),
    evidence_count: (evidence ?? []).length,
    updated_at: product.updated_at ?? null,
  };
}

/** How many recent scans of this product disagreed with the registry. */
export async function recentMismatchCount(sb: Sb, productId: string, days = 60) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data } = await sb
    .from("package_scans")
    .select("id")
    .eq("product_id", productId)
    .eq("registry_match", "mismatch")
    .gte("created_at", since)
    .limit(50);
  return (data ?? []).length;
}

/** Open authority requests keep a product in "review required". */
export async function hasOpenReview(sb: Sb, productId: string) {
  const { data } = await sb
    .from("authority_requests")
    .select("id")
    .eq("product_id", productId)
    .eq("status", "open")
    .limit(1);
  return (data ?? []).length > 0;
}
