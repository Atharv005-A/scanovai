/** Server-only: executes the stored legal rules and persists the results. */
import { evaluateRules, summarise, type RuleRow, type DeclarationRow } from "./rule-engine";
import { compareWithRegistry, type RegistryComparison } from "./registry";
import { registryByBarcode, registryByProductId } from "./registry.server";
import type { FieldKey } from "./domain";

type Sb = {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

export async function auditLog(
  supabase: Sb,
  actor: string,
  action: string,
  entity: string,
  entityId: string | null,
  extra?: {
    previous_value?: unknown;
    new_value?: unknown;
    reason?: string;
    authority_id?: string | null;
  },
) {
  const { error } = await supabase.from("audit_logs").insert({
    actor_id: actor,
    action,
    entity,
    entity_id: entityId,
    previous_value: extra?.previous_value ?? null,
    new_value: extra?.new_value ?? null,
    reason: extra?.reason ?? null,
    ...(extra?.authority_id ? { authority_id: extra.authority_id } : {}),
  });
  if (error) console.error("[audit] insert failed", action, error);
}

export async function activeRuleVersion(supabase: Sb) {
  const { data } = await supabase
    .from("rule_versions")
    .select("id, version_label, source_document")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { id: string; version_label: string; source_document: string } | null;
}

/**
 * Compares the declarations read from the package with the registered product
 * record. Deterministic and advisory: a difference is a review signal, never a
 * legal conclusion.
 */
export async function compareRegistry(
  supabase: Sb,
  inspection: {
    id: string;
    product_id: string | null;
    barcode: string | null;
    authority_id: string | null;
  },
  declarations: DeclarationRow[],
): Promise<{ comparison: RegistryComparison; product: Awaited<ReturnType<typeof registryByProductId>> }> {
  let product = null as Awaited<ReturnType<typeof registryByProductId>>;
  if (inspection.product_id) product = await registryByProductId(supabase, inspection.product_id);
  if (!product && inspection.barcode) product = await registryByBarcode(supabase, inspection.barcode);

  const observed: Partial<Record<FieldKey, { value: string | null; confidence: number }>> = {};
  for (const d of declarations) {
    observed[d.field_key as FieldKey] = { value: d.value, confidence: Number(d.confidence) };
  }

  const comparison = compareWithRegistry({
    product,
    observed,
    barcode: inspection.barcode,
  });
  return { comparison, product };
}

export async function runEngine(supabase: Sb, userId: string, inspectionId: string) {
  const { data: inspection, error: insErr } = await supabase
    .from("inspections")
    .select("*")
    .eq("id", inspectionId)
    .single();
  if (insErr || !inspection) throw new Error("Inspection not found.");

  const version = inspection.rule_version_id
    ? { id: inspection.rule_version_id as string }
    : await activeRuleVersion(supabase);
  if (!version) throw new Error("No active legal rule set is configured.");

  const [{ data: rules }, { data: declarations }, { data: images }, { data: extraction }, { data: previous }] =
    await Promise.all([
      supabase
        .from("rule_definitions")
        .select("*")
        .eq("rule_version_id", version.id)
        .eq("is_active", true)
        .order("display_order"),
      supabase.from("extracted_declarations").select("*").eq("inspection_id", inspectionId),
      supabase.from("inspection_images").select("id").eq("inspection_id", inspectionId).eq("kind", "original"),
      supabase
        .from("extractions")
        .select("id, status")
        .eq("inspection_id", inspectionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("compliance_checks").select("rule_code, result").eq("inspection_id", inspectionId),
    ]);

  const declRows = (declarations ?? []) as unknown as DeclarationRow[];
  const { comparison, product } = await compareRegistry(
    supabase,
    inspection as never,
    declRows,
  );

  const previousByCode = new Map(
    ((previous ?? []) as { rule_code: string; result: string }[]).map((p) => [p.rule_code, p.result]),
  );

  const { checks, conflict } = evaluateRules(
    (rules ?? []) as unknown as RuleRow[],
    declRows,
    {
      category: inspection.category as string,
      hasImages: (images ?? []).length > 0,
      hasExtraction: !!extraction && (extraction.status === "success" || extraction.status === "succeeded"),
      knownProduct: product
        ? { declared_mrp: product.declared_mrp, declared_net_quantity: product.declared_net_quantity }
        : null,
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
    },
  );
  const summary = summarise(checks);

  await supabase.from("compliance_checks").delete().eq("inspection_id", inspectionId);
  if (checks.length > 0) {
    const { error } = await supabase.from("compliance_checks").insert(
      checks.map((c) => ({
        inspection_id: inspectionId,
        rule_id: c.rule_id,
        rule_version_id: version.id,
        rule_code: c.rule_code,
        rule_number: c.rule_number,
        title: c.title,
        requirement: c.requirement,
        field_key: c.field_key,
        detected_value: c.detected_value,
        expected_condition: c.expected_condition,
        result: c.result,
        previous_result: previousByCode.get(c.rule_code) ?? null,
        confidence: c.confidence,
        explanation: c.explanation,
        evidence_image_id: c.evidence_image_id,
        source_section: c.source_section,
        source_page: c.source_page,
      })),
    );
    if (error) throw new Error("The compliance assessment could not be saved.");
  }

  const registryConflict = comparison.match === "mismatch";
  await supabase
    .from("inspections")
    .update({
      result: summary.overall,
      assessment_score: summary.score,
      rule_version_id: version.id,
      status: inspection.status === "finalized" ? "finalized" : "checked",
      conflict_flag: conflict != null || registryConflict,
      conflict_note: conflict ?? (registryConflict ? comparison.headline : null),
      registry_match: comparison.match,
      batch_id: comparison.matchedBatch?.id ?? inspection.batch_id ?? null,
      ...(product && !inspection.product_id ? { product_id: product.id } : {}),
    })
    .eq("id", inspectionId);

  await auditLog(supabase, userId, "compliance.run", "inspection", inspectionId, {
    new_value: {
      overall: summary.overall,
      score: summary.score,
      total: summary.total,
      registry_match: comparison.match,
      rule_version_id: version.id,
    },
    authority_id: inspection.authority_id ?? null,
  });

  // Changed results after a correction, so the interface can show the delta.
  const changed = checks
    .filter((c) => previousByCode.has(c.rule_code) && previousByCode.get(c.rule_code) !== c.result)
    .map((c) => ({
      rule_number: c.rule_number,
      title: c.title,
      from: previousByCode.get(c.rule_code)!,
      to: c.result,
    }));

  return { summary, conflict, registry: comparison, changed };
}

export const runComplianceForDemo = runEngine;
