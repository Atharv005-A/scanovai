/**
 * Deterministic compliance engine.
 *
 * The engine NEVER invents a legal requirement. It only executes the rule
 * records stored in `rule_definitions`, every one of which is derived from the
 * attached official PDF of the Legal Metrology (Packaged Commodities) Rules,
 * 2011 and carries its source section and page.
 *
 * AI output is treated as evidence about the package, not as law.
 */

import { parseQuantity, type CheckResult } from "./domain";

export interface RuleRow {
  id: string;
  rule_code: string;
  rule_number: string;
  title: string;
  requirement: string;
  check_type: string;
  field_key: string | null;
  parameters: Record<string, unknown>;
  applicable_categories: string[];
  exceptions: string | null;
  source_section: string;
  source_page: number | null;
}

export interface DeclarationRow {
  field_key: string;
  value: string | null;
  detected: boolean;
  confidence: number;
  source_image_id: string | null;
}

export interface EngineContext {
  category: string;
  hasImages: boolean;
  hasExtraction: boolean;
  /** Product record resolved from a scanned barcode, when available. */
  knownProduct?: { declared_mrp: number | null; declared_net_quantity: string | null } | null;
}

export interface EvaluatedCheck {
  rule_id: string;
  rule_code: string;
  rule_number: string;
  title: string;
  requirement: string;
  detected_value: string | null;
  expected_condition: string;
  result: CheckResult;
  confidence: number;
  explanation: string;
  evidence_image_id: string | null;
  source_section: string;
  source_page: number | null;
}

const LOW_CONFIDENCE = 0.6;

function applies(rule: RuleRow, category: string) {
  return rule.applicable_categories.includes("all") || rule.applicable_categories.includes(category);
}

function num(x: unknown, fallback: number) {
  return typeof x === "number" && Number.isFinite(x) ? x : fallback;
}

function moneyValue(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = raw.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

interface Schedule2Spec {
  unit: string;
  values: number[];
  multiples_of?: number;
  multiples_from?: number;
  multiples_to?: number;
  below_free?: number;
}

export function evaluateRules(
  rules: RuleRow[],
  declarations: DeclarationRow[],
  ctx: EngineContext,
): { checks: EvaluatedCheck[]; conflict: string | null } {
  const byKey = new Map(declarations.map((d) => [d.field_key, d]));
  const get = (key: string | null) => (key ? (byKey.get(key) ?? null) : null);
  const netQty = parseQuantity(byKey.get("net_quantity")?.value ?? null);
  let conflict: string | null = null;

  // ---- Rule 26 exemption is resolved first: it gates every automated check.
  const exemptionRule = rules.find((r) => r.check_type === "exemption");
  let exempt = false;
  let exemptReason = "";
  if (exemptionRule) {
    const p = exemptionRule.parameters as Record<string, unknown>;
    const exemptCats = (p["exempt_categories"] as string[] | undefined) ?? [];
    if (exemptCats.includes(ctx.category)) {
      exempt = true;
      exemptReason = "The commodity falls in a category excluded by Rule 26.";
    } else if (netQty?.base != null) {
      const maxG = num(p["max_exempt_g"], 10);
      const maxMl = num(p["max_exempt_ml"], 10);
      if (
        (netQty.type === "weight" && netQty.base <= maxG) ||
        (netQty.type === "volume" && netQty.base <= maxMl)
      ) {
        exempt = true;
        exemptReason = `Net quantity ${netQty.value}${netQty.unit} is ${maxG} g / ${maxMl} ml or less.`;
      }
    }
  }

  const checks: EvaluatedCheck[] = [];

  for (const rule of rules) {
    if (!applies(rule, ctx.category)) {
      checks.push(
        base(rule, null, "not_applicable", 0, "This rule does not apply to the confirmed product category."),
      );
      continue;
    }

    const p = rule.parameters as Record<string, unknown>;
    const expected = typeof p["expected"] === "string" ? (p["expected"] as string) : rule.requirement;
    const decl = get(rule.field_key);
    const value = decl?.value?.trim() || null;
    const conf = decl?.confidence ?? 0;
    const evidence = decl?.source_image_id ?? null;

    function base(
      r: RuleRow,
      detected: string | null,
      result: CheckResult,
      confidence: number,
      explanation: string,
    ): EvaluatedCheck {
      return {
        rule_id: r.id,
        rule_code: r.rule_code,
        rule_number: r.rule_number,
        title: r.title,
        requirement: r.requirement,
        detected_value: detected,
        expected_condition: expected,
        result,
        confidence,
        explanation,
        evidence_image_id: evidence,
        source_section: r.source_section,
        source_page: r.source_page,
      };
    }

    if (rule.check_type === "exemption") {
      checks.push(
        base(
          rule,
          netQty ? `${netQty.value} ${netQty.unit}` : null,
          exempt ? "pass" : "not_applicable",
          netQty ? conf : 0,
          exempt
            ? `Rule 26 exemption applies. ${exemptReason} The declaration requirements of these rules are therefore not enforced on this package.`
            : "The package is not exempt under Rule 26, so the declaration requirements apply in full.",
        ),
      );
      continue;
    }

    if (rule.check_type === "manual") {
      checks.push(
        base(
          rule,
          value,
          "manual_verification_required",
          0,
          "This requirement cannot be verified reliably from photographs alone (it depends on physical measurement, panel placement, colour contrast, language or trade context). A human inspector must confirm it.",
        ),
      );
      continue;
    }

    if (exempt) {
      checks.push(
        base(
          rule,
          value,
          "not_applicable",
          0,
          `Not enforced: Rule 26 exempts this package. ${exemptReason}`,
        ),
      );
      continue;
    }

    if (!ctx.hasImages) {
      checks.push(
        base(rule, null, "unable_to_verify", 0, "No package images have been captured for this inspection yet."),
      );
      continue;
    }
    if (!ctx.hasExtraction) {
      checks.push(
        base(
          rule,
          null,
          "unable_to_verify",
          0,
          "Label information has not been extracted yet, so nothing could be compared against this rule.",
        ),
      );
      continue;
    }

    switch (rule.check_type) {
      case "presence": {
        if (!value) {
          checks.push(
            base(
              rule,
              null,
              "fail",
              conf,
              "This mandatory declaration was not found on any of the captured images of the package.",
            ),
          );
        } else if (conf < LOW_CONFIDENCE) {
          checks.push(
            base(
              rule,
              value,
              "needs_review",
              conf,
              "A value was read but with low reading confidence. An inspector must confirm or correct it before this rule is decided.",
            ),
          );
        } else {
          checks.push(base(rule, value, "pass", conf, "The required declaration is present on the package."));
        }
        break;
      }

      case "conditional_presence": {
        const origin = byKey.get("country_of_origin")?.value?.trim() ?? "";
        const importerName = byKey.get("importer_name")?.value?.trim() ?? "";
        const importerAddr = byKey.get("importer_address")?.value?.trim() ?? "";
        const isImport =
          (origin !== "" && !/india/i.test(origin)) || importerName !== "" || importerAddr !== "";
        if (!isImport) {
          checks.push(
            base(
              rule,
              null,
              "not_applicable",
              0,
              "Nothing on the package indicates an imported commodity, so the importer declaration is not required.",
            ),
          );
        } else if (importerName && importerAddr) {
          checks.push(
            base(
              rule,
              `${importerName} — ${importerAddr}`,
              "pass",
              Math.min(conf || 0.8, 1),
              "The package indicates an imported commodity and both the importer name and address are declared.",
            ),
          );
        } else {
          checks.push(
            base(
              rule,
              importerName || importerAddr || origin,
              "fail",
              conf,
              "The package appears to contain an imported commodity but the importer name and address are not both declared.",
            ),
          );
        }
        break;
      }

      case "pattern": {
        if (!value) {
          checks.push(
            base(
              rule,
              null,
              "unable_to_verify",
              0,
              "The underlying declaration was not detected, so its format could not be checked.",
            ),
          );
          break;
        }
        const flags = typeof p["flags"] === "string" ? (p["flags"] as string) : "i";
        const forbidden = p["forbidden_regex"] as string | undefined;
        if (forbidden) {
          const bad = new RegExp(forbidden, flags).test(value);
          checks.push(
            base(
              rule,
              value,
              bad ? "fail" : "pass",
              conf,
              bad
                ? "The declaration contains wording that this rule does not permit."
                : "The declaration does not contain the wording prohibited by this rule.",
            ),
          );
          break;
        }
        const regex = p["regex"] as string | undefined;
        if (!regex) {
          checks.push(
            base(rule, value, "manual_verification_required", conf, "No automated format test is configured for this rule."),
          );
          break;
        }
        const ok = new RegExp(regex, flags).test(value);
        checks.push(
          base(
            rule,
            value,
            ok ? "pass" : conf < LOW_CONFIDENCE ? "needs_review" : "fail",
            conf,
            ok
              ? "The declaration matches the form required by this rule."
              : conf < LOW_CONFIDENCE
                ? "The declaration does not match the required form, but the reading confidence is low. An inspector must confirm the printed text."
                : "The declaration is present but not in the form required by this rule.",
          ),
        );
        break;
      }

      case "unit": {
        if (!netQty) {
          checks.push(
            base(
              rule,
              value,
              value ? "needs_review" : "unable_to_verify",
              conf,
              value
                ? "A quantity was read but no recognised unit of weight, measure or number could be identified in it."
                : "No net quantity declaration was detected.",
            ),
          );
          break;
        }
        const allowed = (p["allowed_units"] as string[] | undefined) ?? [];
        const ok = allowed.map((u) => u.toLowerCase()).includes(netQty.unit);
        checks.push(
          base(
            rule,
            `${netQty.value} ${netQty.unit}`,
            ok ? "pass" : "fail",
            conf,
            ok
              ? `The quantity is declared in "${netQty.unit}", a recognised unit of ${netQty.type}.`
              : `"${netQty.unit}" is not a recognised unit of weight, measure or number for this declaration.`,
          ),
        );
        break;
      }

      case "schedule3_unit": {
        const map = (p["map"] as Record<string, string[]> | undefined) ?? {};
        const required = map[ctx.category];
        if (!required) {
          checks.push(
            base(rule, value, "not_applicable", 0, "This commodity is not listed in the Third Schedule."),
          );
          break;
        }
        if (!netQty) {
          checks.push(
            base(rule, value, "unable_to_verify", conf, "The net quantity could not be read, so its unit type could not be checked."),
          );
          break;
        }
        const typeName = netQty.type === "weight" ? "weight" : netQty.type;
        const ok = required.includes(typeName);
        checks.push(
          base(
            rule,
            `${netQty.value} ${netQty.unit} (${typeName})`,
            ok ? "pass" : "fail",
            conf,
            ok
              ? `The Third Schedule requires this commodity to be declared by ${required.join(" or ")}; the package declares it by ${typeName}.`
              : `The Third Schedule requires this commodity to be declared by ${required.join(" or ")}, but the package declares it by ${typeName}.`,
          ),
        );
        break;
      }

      case "standard_quantity": {
        const map = (p["map"] as Record<string, Schedule2Spec> | undefined) ?? {};
        const spec = map[ctx.category];
        if (!spec) {
          checks.push(
            base(rule, value, "not_applicable", 0, "This commodity is not listed in the Second Schedule."),
          );
          break;
        }
        if (!netQty || netQty.base == null) {
          checks.push(
            base(rule, value, "unable_to_verify", conf, "The net quantity could not be read, so the pack size could not be checked."),
          );
          break;
        }
        const expectedUnit = spec.unit === "ml" ? "volume" : "weight";
        if (netQty.type !== expectedUnit && netQty.type !== "number") {
          checks.push(
            base(
              rule,
              `${netQty.value} ${netQty.unit}`,
              "needs_review",
              conf,
              `The Second Schedule lists standard sizes for this commodity in ${spec.unit}; the package declares a different kind of unit. An inspector should confirm the declaration.`,
            ),
          );
          break;
        }
        const q = netQty.base;
        let ok = spec.values.includes(q);
        if (!ok && spec.below_free != null && q < spec.below_free) ok = true;
        if (!ok && spec.multiples_of) {
          const from = spec.multiples_from ?? spec.multiples_of;
          const to = spec.multiples_to ?? Number.POSITIVE_INFINITY;
          if (q > from && q <= to && q % spec.multiples_of === 0) ok = true;
        }
        const list = spec.values.map((v) => `${v}${spec.unit}`).join(", ");
        checks.push(
          base(
            rule,
            `${netQty.value} ${netQty.unit}`,
            ok ? "pass" : "fail",
            conf,
            ok
              ? `${netQty.value} ${netQty.unit} is a standard quantity for this commodity under the Second Schedule.`
              : `${netQty.value} ${netQty.unit} is not among the standard quantities listed for this commodity (${list}${spec.multiples_of ? `, then multiples of ${spec.multiples_of}${spec.unit}` : ""}).`,
          ),
        );
        break;
      }

      case "cross_field": {
        const known = ctx.knownProduct;
        if (!known) {
          checks.push(
            base(
              rule,
              null,
              "not_applicable",
              0,
              "No product record was linked by barcode, so there is nothing to cross-verify the package against.",
            ),
          );
          break;
        }
        const pkgMrp = moneyValue(byKey.get("mrp")?.value ?? null);
        const pkgQty = parseQuantity(byKey.get("net_quantity")?.value ?? null);
        const knownQty = parseQuantity(known.declared_net_quantity);
        const issues: string[] = [];
        if (known.declared_mrp != null && pkgMrp != null && Math.abs(known.declared_mrp - pkgMrp) > 0.01) {
          issues.push(`recorded MRP ₹${known.declared_mrp} vs package MRP ₹${pkgMrp}`);
        }
        if (knownQty?.base != null && pkgQty?.base != null && knownQty.base !== pkgQty.base) {
          issues.push(
            `recorded net quantity ${knownQty.value}${knownQty.unit} vs package ${pkgQty.value}${pkgQty.unit}`,
          );
        }
        if (issues.length === 0) {
          checks.push(
            base(
              rule,
              pkgMrp != null ? `₹${pkgMrp}` : null,
              "pass",
              conf,
              "The declarations read from the package match the product record linked by barcode.",
            ),
          );
        } else {
          conflict = `Information conflict: ${issues.join("; ")}.`;
          checks.push(
            base(
              rule,
              issues.join("; "),
              "needs_review",
              conf,
              `Conflict detected between the physical package and the recorded product data (${issues.join("; ")}). Barcode data never overrides the package: a human must verify which is correct.`,
            ),
          );
        }
        break;
      }

      default:
        checks.push(
          base(
            rule,
            value,
            "manual_verification_required",
            conf,
            "No automated check is configured for this requirement, so it is left for human verification.",
          ),
        );
    }
  }

  return { checks, conflict };

  function base(
    r: RuleRow,
    detected: string | null,
    result: CheckResult,
    confidence: number,
    explanation: string,
  ): EvaluatedCheck {
    return {
      rule_id: r.id,
      rule_code: r.rule_code,
      rule_number: r.rule_number,
      title: r.title,
      requirement: r.requirement,
      detected_value: detected,
      expected_condition:
        typeof (r.parameters as Record<string, unknown>)["expected"] === "string"
          ? ((r.parameters as Record<string, unknown>)["expected"] as string)
          : r.requirement,
      result,
      confidence,
      explanation,
      evidence_image_id: null,
      source_section: r.source_section,
      source_page: r.source_page,
    };
  }
}

export interface Summary {
  total: number;
  pass: number;
  fail: number;
  needs_review: number;
  not_applicable: number;
  unable_to_verify: number;
  manual: number;
  score: number | null;
  overall: "compliant" | "non_compliant" | "needs_review" | "unable_to_verify";
}

export function summarise(checks: EvaluatedCheck[]): Summary {
  const count = (r: CheckResult) => checks.filter((c) => c.result === r).length;
  const pass = count("pass");
  const fail = count("fail");
  const needs_review = count("needs_review");
  const not_applicable = count("not_applicable");
  const unable_to_verify = count("unable_to_verify");
  const manual = count("manual_verification_required");
  const decided = pass + fail;
  const score = decided > 0 ? Math.round((pass / decided) * 100) : null;

  let overall: Summary["overall"];
  if (fail > 0) overall = "non_compliant";
  else if (needs_review > 0) overall = "needs_review";
  else if (pass === 0) overall = "unable_to_verify";
  else if (unable_to_verify > 0) overall = "needs_review";
  else overall = "compliant";

  return {
    total: checks.length,
    pass,
    fail,
    needs_review,
    not_applicable,
    unable_to_verify,
    manual,
    score,
    overall,
  };
}
