import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { FIELD_LABELS, bandFromConfidence } from "./domain";

type Sb = { from: (t: string) => any };

const DEMO_AUTHORITY = {
  code: "LM-DEMO",
  name: "Legal Metrology Department (Demo Authority)",
  state: "Maharashtra",
};

/**
 * Idempotent per-user setup: makes sure the signed-in user has a profile and,
 * for government roles, an active membership of an authority + office so that
 * authority-level isolation and dashboards have something to scope to.
 */
export const bootstrapWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context as unknown as {
      supabase: Sb;
      userId: string;
      claims: Record<string, unknown>;
    };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const email = (claims["email"] as string | undefined) ?? "";
    const meta = (claims["user_metadata"] as Record<string, unknown> | undefined) ?? {};
    const fullName = (meta["full_name"] as string | undefined) ?? email.split("@")[0] ?? "User";

    await supabaseAdmin
      .from("profiles")
      .upsert({ id: userId, email, full_name: fullName }, { onConflict: "id" });

    const { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    let roles = ((roleRows ?? []) as { role: string }[]).map((r) => r.role);
    if (roles.length === 0) {
      const requested = (meta["requested_role"] as string | undefined) ?? "citizen";
      const allowed = ["citizen", "inspector", "supervisor", "manufacturer", "authority_admin"];
      const role = allowed.includes(requested) ? requested : "citizen";
      await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: role as never });
      roles = [role];
    }

    const govRoles = roles.filter((r) => ["inspector", "supervisor", "authority_admin"].includes(r));
    let authorityId: string | null = null;
    let officeId: string | null = null;

    if (govRoles.length > 0) {
      const { data: authority } = await supabaseAdmin
        .from("authorities")
        .select("id")
        .eq("code", DEMO_AUTHORITY.code)
        .maybeSingle();
      let aId = authority?.id as string | undefined;
      if (!aId) {
        const { data: created } = await supabaseAdmin
          .from("authorities")
          .insert({ ...DEMO_AUTHORITY, is_demo: true })
          .select("id")
          .single();
        aId = created?.id as string | undefined;
      }
      if (aId) {
        authorityId = aId;
        let { data: dept } = await supabaseAdmin
          .from("departments")
          .select("id")
          .eq("authority_id", aId)
          .limit(1)
          .maybeSingle();
        if (!dept) {
          const { data: d } = await supabaseAdmin
            .from("departments")
            .insert({ authority_id: aId, name: "Enforcement Department" })
            .select("id")
            .single();
          dept = d;
        }
        let { data: office } = await supabaseAdmin
          .from("offices")
          .select("id")
          .eq("authority_id", aId)
          .limit(1)
          .maybeSingle();
        if (!office) {
          const { data: o } = await supabaseAdmin
            .from("offices")
            .insert({
              authority_id: aId,
              department_id: dept?.id ?? null,
              name: "Pune District Office",
              district: "Pune",
              state: DEMO_AUTHORITY.state,
            })
            .select("id")
            .single();
          office = o;
        }
        officeId = (office?.id as string | undefined) ?? null;

        const { data: membership } = await supabaseAdmin
          .from("authority_members")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();
        if (!membership) {
          await supabaseAdmin.from("authority_members").insert({
            authority_id: aId,
            user_id: userId,
            member_role: govRoles[0] as never,
            office_id: officeId,
            is_active: true,
          });
        }
      }
    }

    if (roles.includes("manufacturer")) {
      const { data: mfr } = await supabaseAdmin
        .from("manufacturers")
        .select("id")
        .eq("owner_id", userId)
        .maybeSingle();
      if (!mfr) {
        await supabaseAdmin.from("manufacturers").insert({
          owner_id: userId,
          name: `${fullName} Foods Pvt Ltd`,
          country: "India",
          contact_email: email,
        });
      }
    }

    return { roles, authorityId, officeId };
  });

interface DemoField {
  key: string;
  value: string | null;
  confidence: number;
}

interface DemoCase {
  label: string;
  category: string;
  product_name: string;
  manufacturer_name: string;
  barcode?: string;
  withProduct?: { mrp: number; qty: string };
  fields: DemoField[];
}

const F = (key: string, value: string | null, confidence = 0.95): DemoField => ({ key, value, confidence });

const FULL = (over: Partial<Record<string, [string | null, number]>> = {}): DemoField[] => {
  const base: Record<string, [string | null, number]> = {
    commodity_name: ["Glucose Biscuits", 0.96],
    manufacturer_name: ["Sunrise Foods Pvt Ltd", 0.94],
    manufacturer_address: ["Plot 42, MIDC Industrial Area, Pune, Maharashtra - 411019", 0.92],
    net_quantity: ["200 g", 0.97],
    mrp: ["MRP Rs 40.00 incl. of all taxes", 0.95],
    manufacture_date: ["03/2025", 0.93],
    consumer_care: ["Consumer Care Cell, Sunrise Foods Pvt Ltd, Pune - 411019", 0.9],
    consumer_care_phone: ["+91 20 6655 4433", 0.91],
    consumer_care_email: ["care@sunrisefoods.example", 0.88],
    batch_number: ["B-2503-118", 0.9],
    country_of_origin: ["India", 0.93],
  };
  const merged = { ...base, ...over };
  return Object.entries(merged)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => F(k, v![0], v![1]));
};

const DEMO_CASES: DemoCase[] = [
  {
    label: "DEMO — fully compliant pack",
    category: "biscuits",
    product_name: "Glucose Biscuits 200 g",
    manufacturer_name: "Sunrise Foods Pvt Ltd",
    barcode: "8901234567890",
    fields: FULL(),
  },
  {
    label: "DEMO — missing mandatory declarations",
    category: "salt",
    product_name: "Iodised Table Salt 1 kg",
    manufacturer_name: "Sagar Salt Works",
    fields: FULL({
      commodity_name: ["Iodised Table Salt", 0.95],
      manufacturer_name: ["Sagar Salt Works", 0.93],
      net_quantity: ["1 kg", 0.96],
      mrp: [null, 0],
      consumer_care: [null, 0],
      consumer_care_phone: [null, 0],
      consumer_care_email: [null, 0],
      manufacture_date: [null, 0],
    }),
  },
  {
    label: "DEMO — barcode vs package conflict",
    category: "edible_oil",
    product_name: "Sunflower Oil 1 L",
    manufacturer_name: "Golden Fields Oils Ltd",
    barcode: "8907654321098",
    withProduct: { mrp: 180, qty: "1 l" },
    fields: FULL({
      commodity_name: ["Refined Sunflower Oil", 0.95],
      manufacturer_name: ["Golden Fields Oils Ltd", 0.94],
      manufacturer_address: ["Survey 118, Hadapsar, Pune, Maharashtra - 411028", 0.9],
      net_quantity: ["1 l", 0.96],
      mrp: ["MRP Rs 210.00 incl. of all taxes", 0.94],
    }),
  },
  {
    label: "DEMO — low-confidence reading needing review",
    category: "tea",
    product_name: "Assam Tea 250 g",
    manufacturer_name: "Hillside Tea Estates",
    fields: FULL({
      commodity_name: ["Assam Black Tea", 0.9],
      manufacturer_name: ["Hillside Tea Estates", 0.88],
      manufacturer_address: ["Tea Garden Road, Jorhat, Assam - 785001", 0.85],
      net_quantity: ["250 g", 0.41],
      mrp: ["MRP Rs 165.00 incl. of all taxes", 0.44],
    }),
  },
  {
    label: "DEMO — non-standard pack size",
    category: "biscuits",
    product_name: "Cream Biscuits 137 g",
    manufacturer_name: "Sunrise Foods Pvt Ltd",
    fields: FULL({ commodity_name: ["Cream Biscuits", 0.95], net_quantity: ["137 g", 0.96] }),
  },
  {
    label: "DEMO — exempt small sachet (Rule 26)",
    category: "other",
    product_name: "Shampoo Sachet 8 ml",
    manufacturer_name: "CleanCare Industries",
    fields: [
      F("commodity_name", "Shampoo", 0.94),
      F("manufacturer_name", "CleanCare Industries", 0.9),
      F("net_quantity", "8 ml", 0.95),
    ],
  },
];

/** Creates clearly-labelled demo inspections that run through the real pipeline. */
export const loadDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { runComplianceForDemo } = await import("./demo.server");

    const { data: existing } = await supabase
      .from("inspections")
      .select("id")
      .eq("inspector_id", userId)
      .eq("is_demo", true)
      .limit(1);
    if (existing && existing.length > 0) return { created: 0, alreadyPresent: true as const };

    const { data: member } = await supabase
      .from("authority_members")
      .select("authority_id, office_id")
      .eq("user_id", userId)
      .maybeSingle();

    let created = 0;
    for (const demo of DEMO_CASES) {
      let productId: string | null = null;
      if (demo.withProduct && demo.barcode) {
        const { data: product } = await supabase
          .from("products")
          .insert({
            name: demo.product_name,
            category: demo.category,
            barcode: demo.barcode,
            declared_mrp: demo.withProduct.mrp,
            declared_net_quantity: demo.withProduct.qty,
            created_by: userId,
            is_demo: true,
          })
          .select("id")
          .single();
        productId = (product?.id as string | undefined) ?? null;
      }

      const { data: inspection, error } = await supabase
        .from("inspections")
        .insert({
          inspector_id: userId,
          authority_id: member?.authority_id ?? null,
          office_id: member?.office_id ?? null,
          category: demo.category,
          product_name: `${demo.product_name}`,
          manufacturer_name: demo.manufacturer_name,
          barcode: demo.barcode ?? null,
          barcode_format: demo.barcode ? "EAN_13" : null,
          product_id: productId,
          location_label: "Pune, Maharashtra (demo)",
          latitude: 18.5204,
          longitude: 73.8567,
          status: "extracted",
          is_demo: true,
          sync_status: "synced",
          inspector_notes: demo.label,
        })
        .select("id")
        .single();
      if (error || !inspection) continue;

      await supabase.from("inspection_images").insert({
        inspection_id: inspection.id,
        side: "front",
        storage_path: `demo/${inspection.id}/front.jpg`,
        quality_score: 0.9,
        quality_note: "Demo record — no photograph is stored for demo data.",
      });

      await supabase.from("extractions").insert({
        inspection_id: inspection.id,
        provider: "demo",
        model: "demo-fixture",
        raw_text: demo.fields.map((f) => `${FIELD_LABELS[f.key]}: ${f.value ?? "-"}`).join("\n"),
        structured: { demo: true } as never,
        status: "success",
      });

      await supabase.from("extracted_declarations").insert(
        demo.fields.map((f) => ({
          inspection_id: inspection.id,
          field_key: f.key,
          field_label: FIELD_LABELS[f.key] ?? f.key,
          value: f.value,
          detected: f.value != null,
          confidence: f.value != null ? f.confidence : 0,
          band: bandFromConfidence(f.value != null ? f.confidence : 0),
        })) as never,
      );

      await runComplianceForDemo(supabase, userId, inspection.id);
      created += 1;
    }

    return { created, alreadyPresent: false as const };
  });
