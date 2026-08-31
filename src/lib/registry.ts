/**
 * Registry comparison — pure, deterministic, no AI, no network.
 *
 * A barcode is an identity key, never proof of legal compliance. This module
 * only reports whether the declarations observed on a physical package agree
 * with the declarations a manufacturer registered for that product/SKU. It
 * never concludes that anything is unlawful; disagreement produces a review
 * signal for a person to resolve.
 */

import {
  COMPARABLE_FIELDS,
  FIELD_LABELS,
  looseTextEqual,
  parseMoney,
  parseQuantity,
  type FieldKey,
  type RegistryMatch,
} from "./domain";

export interface RegistryBatch {
  id: string;
  batch_code: string;
  status: string;
  production_date: string | null;
  packing_date: string | null;
  quantity_produced: number | null;
  declared_net_quantity: string | null;
  declared_mrp: number | null;
  notes: string | null;
}

export interface RegistryProduct {
  id: string;
  sku_code: string | null;
  name: string;
  category: string;
  status: string;
  manufacturer_id: string | null;
  manufacturer_name: string | null;
  packer_name: string | null;
  importer_name: string | null;
  country_of_origin: string | null;
  declared_mrp: number | null;
  declared_net_quantity: string | null;
  /** Extra registered declarations keyed by FieldKey. */
  declarations: Partial<Record<FieldKey, string | null>>;
  barcodes: string[];
  batches: RegistryBatch[];
  evidence_count: number;
  updated_at: string | null;
}

export interface ObservedValue {
  value: string | null;
  confidence: number;
}

export type DiffStatus =
  | "same"
  | "different"
  | "missing_on_package"
  | "not_registered"
  | "low_confidence";

export interface FieldDiff {
  field_key: FieldKey;
  label: string;
  registry_value: string | null;
  observed_value: string | null;
  observed_confidence: number;
  status: DiffStatus;
  detail: string;
}

export interface RegistryComparison {
  match: RegistryMatch;
  headline: string;
  differences: FieldDiff[];
  differing: FieldDiff[];
  matchedBatch: RegistryBatch | null;
  comparedCount: number;
  /** True when a person must resolve the comparison before any conclusion. */
  needsHumanReview: boolean;
}

const LOW_CONFIDENCE = 0.6;

function registryValueFor(product: RegistryProduct, key: FieldKey): string | null {
  switch (key) {
    case "commodity_name":
      return product.name ?? null;
    case "manufacturer_name":
      return product.manufacturer_name ?? null;
    case "net_quantity":
      return product.declared_net_quantity ?? null;
    case "mrp":
      return product.declared_mrp == null ? null : String(product.declared_mrp);
    case "country_of_origin":
      return product.country_of_origin ?? null;
    default:
      return product.declarations[key] ?? null;
  }
}

function compareOne(
  key: FieldKey,
  registryRaw: string | null,
  observed: ObservedValue | undefined,
): FieldDiff {
  const label = FIELD_LABELS[key] ?? key;
  const observedValue = observed?.value?.trim() ? observed.value.trim() : null;
  const confidence = observed?.confidence ?? 0;

  if (!registryRaw) {
    return {
      field_key: key,
      label,
      registry_value: null,
      observed_value: observedValue,
      observed_confidence: confidence,
      status: "not_registered",
      detail: "Not registered for this product, so nothing could be compared.",
    };
  }
  if (!observedValue) {
    return {
      field_key: key,
      label,
      registry_value: registryRaw,
      observed_value: null,
      observed_confidence: confidence,
      status: "missing_on_package",
      detail: "Registered, but not read from the package images.",
    };
  }
  if (confidence > 0 && confidence < LOW_CONFIDENCE) {
    return {
      field_key: key,
      label,
      registry_value: registryRaw,
      observed_value: observedValue,
      observed_confidence: confidence,
      status: "low_confidence",
      detail: "The reading was uncertain, so the comparison is inconclusive.",
    };
  }

  let same = false;
  let detail = "";
  if (key === "net_quantity") {
    const a = parseQuantity(registryRaw);
    const b = parseQuantity(observedValue);
    if (a?.base != null && b?.base != null && a.type === b.type) {
      same = Math.abs(a.base - b.base) < Math.max(0.5, a.base * 0.001);
      detail = same
        ? `Both resolve to ${a.base} ${a.type === "weight" ? "g" : a.type === "volume" ? "ml" : a.unit}.`
        : `Registry declares ${registryRaw}; the package reads ${observedValue}.`;
    } else {
      same = registryRaw.replace(/\s+/g, "").toLowerCase() === observedValue.replace(/\s+/g, "").toLowerCase();
      detail = same ? "Identical text." : `Registry declares ${registryRaw}; the package reads ${observedValue}.`;
    }
  } else if (key === "mrp") {
    const a = parseMoney(registryRaw);
    const b = parseMoney(observedValue);
    if (a != null && b != null) {
      same = Math.abs(a - b) < 0.01;
      detail = same
        ? `Both declare ₹${a.toFixed(2)}.`
        : `Registry declares ₹${a.toFixed(2)}; the package reads ₹${b.toFixed(2)}.`;
    } else {
      same = false;
      detail = "One of the two prices could not be read as an amount.";
    }
  } else if (key === "commodity_name" || key === "manufacturer_name") {
    same = looseTextEqual(registryRaw, observedValue);
    detail = same
      ? "Names agree once punctuation and company suffixes are ignored."
      : `Registry says “${registryRaw}”; the package reads “${observedValue}”.`;
  } else if (key === "batch_number") {
    same = registryRaw.replace(/[^a-z0-9]/gi, "").toUpperCase() === observedValue.replace(/[^a-z0-9]/gi, "").toUpperCase();
    detail = same ? "Batch identifiers agree." : `Registry batch ${registryRaw}; package reads ${observedValue}.`;
  } else {
    same =
      registryRaw.trim().toLowerCase().replace(/\s+/g, " ") ===
      observedValue.trim().toLowerCase().replace(/\s+/g, " ");
    detail = same ? "Identical text." : `Registry says “${registryRaw}”; the package reads “${observedValue}”.`;
  }

  return {
    field_key: key,
    label,
    registry_value: registryRaw,
    observed_value: observedValue,
    observed_confidence: confidence,
    status: same ? "same" : "different",
    detail,
  };
}

/** Locates the batch whose code appears on the package. */
export function matchBatch(
  product: RegistryProduct,
  observedBatch: string | null | undefined,
): RegistryBatch | null {
  if (!observedBatch) return null;
  const needle = observedBatch.replace(/[^a-z0-9]/gi, "").toUpperCase();
  if (needle.length < 3) return null;
  return (
    product.batches.find((b) => b.batch_code.replace(/[^a-z0-9]/gi, "").toUpperCase() === needle) ??
    product.batches.find((b) => {
      const code = b.batch_code.replace(/[^a-z0-9]/gi, "").toUpperCase();
      return code.length >= 4 && (needle.includes(code) || code.includes(needle));
    }) ??
    null
  );
}

export interface CompareInput {
  product: RegistryProduct | null;
  observed: Partial<Record<FieldKey, ObservedValue>>;
  /** Barcode that was scanned or typed, if any. */
  barcode: string | null;
}

export function compareWithRegistry({ product, observed, barcode }: CompareInput): RegistryComparison {
  const observedCount = Object.values(observed).filter((v) => v?.value?.trim()).length;

  if (!product) {
    const match: RegistryMatch = barcode ? "barcode_unknown" : "barcode_absent";
    return {
      match,
      headline: barcode
        ? "This barcode is not in the product registry."
        : "No barcode was available, so the registry could not be searched by identity.",
      differences: [],
      differing: [],
      matchedBatch: null,
      comparedCount: 0,
      needsHumanReview: false,
    };
  }

  const observedBatch = observed.batch_number?.value ?? null;
  const matchedBatch = matchBatch(product, observedBatch);

  const registryForCompare: RegistryProduct = matchedBatch
    ? {
        ...product,
        declared_mrp: matchedBatch.declared_mrp ?? product.declared_mrp,
        declared_net_quantity: matchedBatch.declared_net_quantity ?? product.declared_net_quantity,
      }
    : product;

  const differences = COMPARABLE_FIELDS.filter((key) => key !== "batch_number").map((key) =>
    compareOne(key, registryValueFor(registryForCompare, key), observed[key]),
  );

  if (observedBatch || product.batches.length > 0) {
    differences.push(
      compareOne("batch_number", matchedBatch?.batch_code ?? null, observed.batch_number),
    );
  }

  const comparable = differences.filter((d) => d.status === "same" || d.status === "different");
  const differing = differences.filter((d) => d.status === "different");
  const uncertain = differences.filter((d) => d.status === "low_confidence");

  let match: RegistryMatch;
  let headline: string;

  if (observedCount === 0) {
    match = "insufficient_evidence";
    headline = "The product is registered, but nothing was read from the package to compare against.";
  } else if (differing.length > 0) {
    match = "mismatch";
    headline = `${differing.length} declaration${differing.length === 1 ? "" : "s"} on the package differ from the registered record.`;
  } else if (uncertain.length > 0 || comparable.length === 0) {
    match = "review";
    headline = "The comparison could not be completed confidently — a person should confirm it.";
  } else if (matchedBatch) {
    match = "batch_found";
    headline = `Package agrees with the registered record for batch ${matchedBatch.batch_code}.`;
  } else if (observedBatch) {
    match = "product_found_batch_unknown";
    headline = `Product is registered and its declarations agree, but batch “${observedBatch}” is not on record.`;
  } else {
    match = "match";
    headline = "Every comparable declaration on the package agrees with the registered record.";
  }

  return {
    match,
    headline,
    differences,
    differing,
    matchedBatch,
    comparedCount: comparable.length,
    needsHumanReview: match === "mismatch" || match === "review",
  };
}

/** Retail alert derived from registry state — never a legal conclusion. */
export function retailAlertFor(input: {
  product: RegistryProduct | null;
  openReview: boolean;
  recentMismatches: number;
}): { alert: "verified" | "potential_mismatch" | "review_required" | "product_not_found"; reason: string } {
  if (!input.product) {
    return {
      alert: "product_not_found",
      reason: "This barcode is not in the registry. Registration is not compulsory, so this alone means nothing is wrong.",
    };
  }
  if (input.openReview || input.product.status === "suspended") {
    return {
      alert: "review_required",
      reason: "The authority has an open review, or a hold, on this product record.",
    };
  }
  if (input.recentMismatches > 0) {
    return {
      alert: "potential_mismatch",
      reason: `${input.recentMismatches} recent scan${input.recentMismatches === 1 ? "" : "s"} reported package details that differ from the registry.`,
    };
  }
  return {
    alert: "verified",
    reason: `Registered as “${input.product.name}” with no open flags.`,
  };
}
