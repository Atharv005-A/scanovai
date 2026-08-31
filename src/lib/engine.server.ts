/** Server-only: executes the stored legal rules and persists the results. */
import { evaluateRules, summarise, type RuleRow, type DeclarationRow } from "./rule-engine";

type Sb = { from: (t: string) => any };

export async function auditLog(
  supabase: Sb,
  actor: string,
  action: string,
  entity: string,
  entityId: string | null,
  extra?: { previous_value?: unknown; new_value?: unknown; reason?: string },
) {
  await supabase.from("audit_logs").insert({
    actor_id: actor,
    action,
    entity,
    entity_id: entityId,
    previous_value: extra?.previous_value ?? null,
    new_value: extra?.new_value ?? null,
    reason: extra?.reason ?? null,
  });
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

  const [{ data: rules }, { data: declarations }, { data: images }, { data: extraction }] =
    await Promise.all([
      supabase
        .from("rule_definitions")
        .select("*")
        .eq("rule_version_id", version.id)
        .eq("is_active", true)
        .order("display_order"),
      supabase.from("extracted_declarations").select("*").eq("inspection_id", inspectionId),
      supabase.from("inspection_images").select("id").eq("inspection_id", inspectionId),
      supabase
        .from("extractions")
        .select("id, status")
        .eq("inspection_id", inspectionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  let knownProduct: { declared_mrp: number | null; declared_net_quantity: string | null } | null = null;
  if (inspection.product_id) {
    const { data } = await supabase
      .from("products")
      .select("declared_mrp, declared_net_quantity")
      .eq("id", inspection.product_id)
      .maybeSingle();
    knownProduct = data ?? null;
  }

  const { checks, conflict } = evaluateRules(
    (rules ?? []) as unknown as RuleRow[],
    (declarations ?? []) as unknown as DeclarationRow[],
    {
      category: inspection.category as string,
      hasImages: (images ?? []).length > 0,
      hasExtraction: !!extraction && extraction.status === "success",
      knownProduct,
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
        detected_value: c.detected_value,
        expected_condition: c.expected_condition,
        result: c.result,
        confidence: c.confidence,
        explanation: c.explanation,
        evidence_image_id: c.evidence_image_id,
        source_section: c.source_section,
        source_page: c.source_page,
      })),
    );
    if (error) throw new Error("The compliance assessment could not be saved.");
  }

  await supabase
    .from("inspections")
    .update({
      result: summary.overall,
      assessment_score: summary.score,
      rule_version_id: version.id,
      status: inspection.status === "finalized" ? "finalized" : "checked",
      conflict_flag: conflict != null,
      conflict_note: conflict,
    })
    .eq("id", inspectionId);

  await auditLog(supabase, userId, "compliance.run", "inspection", inspectionId, {
    new_value: { overall: summary.overall, score: summary.score, total: summary.total },
  });

  return { summary, conflict };
}

export const runComplianceForDemo = runEngine;
