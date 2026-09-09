/**
 * Shared domain vocabulary for SCANOVA-AI.
 * Field keys mirror the declarations required by the Legal Metrology
 * (Packaged Commodities) Rules, 2011 (attached official PDF).
 */

export type FieldKey =
  | "commodity_name"
  | "manufacturer_name"
  | "manufacturer_address"
  | "packer_name"
  | "packer_address"
  | "importer_name"
  | "importer_address"
  | "net_quantity"
  | "mrp"
  | "manufacture_date"
  | "consumer_care"
  | "consumer_care_phone"
  | "consumer_care_email"
  | "batch_number"
  | "country_of_origin"
  | "dimensions";

export interface FieldDef {
  key: FieldKey;
  label: string;
  hint: string;
}

export const FIELD_DEFS: FieldDef[] = [
  {
    key: "commodity_name",
    label: "Common or generic name",
    hint: "The common name of the commodity inside the package",
  },
  { key: "manufacturer_name", label: "Manufacturer name", hint: "Name as printed on the label" },
  {
    key: "manufacturer_address",
    label: "Manufacturer address",
    hint: "Complete address including city/State or PIN code",
  },
  { key: "packer_name", label: "Packer name", hint: "Only if different from the manufacturer" },
  { key: "packer_address", label: "Packer address", hint: "Only if a separate packer is named" },
  { key: "importer_name", label: "Importer name", hint: "Required for imported packages" },
  { key: "importer_address", label: "Importer address", hint: "Required for imported packages" },
  { key: "net_quantity", label: "Net quantity", hint: "For example 500 g, 1 kg, 200 ml" },
  { key: "mrp", label: "Retail sale price (MRP)", hint: "As printed, including the wording used" },
  {
    key: "manufacture_date",
    label: "Month & year of manufacture / packing",
    hint: "For example 03/2025 or MAR 2025",
  },
  { key: "consumer_care", label: "Consumer care name / address", hint: "Contact for complaints" },
  { key: "consumer_care_phone", label: "Consumer care phone", hint: "Telephone number on pack" },
  { key: "consumer_care_email", label: "Consumer care e-mail", hint: "Only if printed" },
  { key: "batch_number", label: "Batch / lot number", hint: "If printed on the package" },
  { key: "country_of_origin", label: "Country of origin", hint: "For imported packages" },
  { key: "dimensions", label: "Dimensions", hint: "Where the size of the commodity is relevant" },
];

export const FIELD_LABELS: Record<string, string> = Object.fromEntries(
  FIELD_DEFS.map((f) => [f.key, f.label]),
);

export interface CategoryDef {
  value: string;
  label: string;
  group: string;
}

/** Categories used to decide which rules apply. Schedule names come from the PDF. */
export const CATEGORIES: CategoryDef[] = [
  { value: "biscuits", label: "Biscuits", group: "Second Schedule" },
  { value: "bread", label: "Bread", group: "Second Schedule" },
  { value: "butter", label: "Butter / margarine", group: "Second Schedule" },
  { value: "cereals_pulses", label: "Cereals & pulses", group: "Second Schedule" },
  { value: "coffee", label: "Coffee", group: "Second Schedule" },
  { value: "tea", label: "Tea", group: "Second Schedule" },
  { value: "beverage_mix", label: "Beverage mix / powder", group: "Second Schedule" },
  { value: "edible_oil", label: "Edible oil / vanaspati / ghee", group: "Second & Third Schedule" },
  { value: "milk_powder", label: "Milk powder", group: "Second Schedule" },
  { value: "detergent_powder", label: "Detergent powder", group: "Second Schedule" },
  { value: "flour", label: "Flour / atta / rawa / suji", group: "Second Schedule" },
  { value: "salt", label: "Salt", group: "Second Schedule" },
  { value: "laundry_soap", label: "Laundry soap", group: "Second Schedule" },
  { value: "toilet_soap", label: "Toilet soap", group: "Second Schedule" },
  { value: "soft_drinks", label: "Aerated / soft drinks", group: "Second Schedule" },
  { value: "packaged_water", label: "Packaged drinking water", group: "Second Schedule" },
  { value: "cement", label: "Cement in bags", group: "Second Schedule" },
  { value: "paint_liquid", label: "Paint / varnish (liquid)", group: "Second & Third Schedule" },
  { value: "paste_paint", label: "Paste / solid paint", group: "Second & Third Schedule" },
  { value: "cosmetics", label: "Cosmetics", group: "Third Schedule" },
  { value: "sauces", label: "Sauces", group: "Third Schedule" },
  { value: "honey", label: "Honey / syrup", group: "Third Schedule" },
  { value: "curd", label: "Curd", group: "Third Schedule" },
  { value: "ice_cream", label: "Ice cream", group: "Third Schedule" },
  { value: "lpg", label: "Liquefied petroleum gas", group: "Third Schedule" },
  { value: "aerosol", label: "Aerosol products", group: "Third Schedule" },
  { value: "yarn", label: "Yarn", group: "Third Schedule" },
  { value: "ready_made_garments", label: "Ready-made garments", group: "Third Schedule" },
  { value: "fast_food", label: "Fast food packed by hotel/restaurant", group: "Rule 26 exemption" },
  { value: "drug_formulation", label: "Drug formulation (DPCO)", group: "Rule 26 exemption" },
  { value: "other", label: "Other packaged commodity", group: "General" },
];

/**
 * Simple, plain-language groups an inspector or citizen picks from.
 * These are deliberately broad: the deterministic engine still applies every
 * Rule 6 mandatory declaration, and any schedule-specific check that truly
 * needs the exact commodity is reported as "manual verification required".
 */
export interface CategoryGroupDef {
  value: string;
  label: string;
  hint: string;
  /** Specific Second/Third Schedule categories that sit inside this group. */
  members: string[];
}

export const CATEGORY_GROUPS: CategoryGroupDef[] = [
  {
    value: "group_food",
    label: "Food & drink",
    hint: "Biscuits, flour, tea, oil, water, soft drinks, dairy, sauces…",
    members: [
      "biscuits",
      "bread",
      "butter",
      "cereals_pulses",
      "coffee",
      "tea",
      "beverage_mix",
      "edible_oil",
      "milk_powder",
      "flour",
      "salt",
      "soft_drinks",
      "packaged_water",
      "sauces",
      "honey",
      "curd",
      "ice_cream",
      "fast_food",
    ],
  },
  {
    value: "group_personal_care",
    label: "Personal care & cosmetics",
    hint: "Soap, shampoo, creams, deodorants, medicines",
    members: ["toilet_soap", "cosmetics", "aerosol", "drug_formulation"],
  },
  {
    value: "group_household",
    label: "Household & cleaning",
    hint: "Detergents, laundry soap, cleaners, LPG cylinders",
    members: ["detergent_powder", "laundry_soap", "lpg"],
  },
  {
    value: "group_building",
    label: "Building & industrial",
    hint: "Cement, paints, varnishes",
    members: ["cement", "paint_liquid", "paste_paint"],
  },
  {
    value: "group_textiles",
    label: "Clothing & textiles",
    hint: "Garments, yarn, fabric packs",
    members: ["ready_made_garments", "yarn"],
  },
  {
    value: "group_other",
    label: "Other packaged goods",
    hint: "Anything else sold in a sealed package",
    members: ["other"],
  },
];

export const CATEGORY_GROUP_VALUES = CATEGORY_GROUPS.map((g) => g.value);

/** True when the value is one of the six simple groups rather than an exact commodity. */
export function isCategoryGroup(value: string | null | undefined): boolean {
  return !!value && CATEGORY_GROUP_VALUES.includes(value);
}

/** Specific commodity -> simple group, used to keep old records readable. */
export const CATEGORY_TO_GROUP: Record<string, string> = Object.fromEntries(
  CATEGORY_GROUPS.flatMap((g) => g.members.map((m) => [m, g.value])),
);

export function groupForCategory(value: string | null | undefined): string {
  if (!value) return "group_other";
  if (isCategoryGroup(value)) return value;
  return CATEGORY_TO_GROUP[value] ?? "group_other";
}

/** Every accepted category value: the six groups plus the detailed list. */
export const ALL_CATEGORY_VALUES = [
  ...CATEGORY_GROUP_VALUES,
  ...CATEGORIES.map((c) => c.value),
];

export const CATEGORY_LABELS: Record<string, string> = {
  ...Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label])),
  ...Object.fromEntries(CATEGORY_GROUPS.map((g) => [g.value, g.label])),
};


export const IMAGE_SIDES = [
  { value: "front", label: "Front of pack" },
  { value: "back", label: "Back of pack" },
  { value: "side", label: "Side panel" },
  { value: "top_bottom", label: "Top / bottom" },
  { value: "declaration", label: "Declaration close-up" },
] as const;

export type CheckResult =
  | "pass"
  | "fail"
  | "needs_review"
  | "not_applicable"
  | "unable_to_verify"
  | "manual_verification_required";

export const RESULT_LABELS: Record<CheckResult, string> = {
  pass: "Pass",
  fail: "Fail",
  needs_review: "Needs review",
  not_applicable: "Not applicable",
  unable_to_verify: "Unable to verify",
  manual_verification_required: "Manual verification required",
};

export const OVERALL_LABELS: Record<string, string> = {
  compliant: "Compliant",
  non_compliant: "Non-compliant",
  needs_review: "Needs manual review",
  unable_to_verify: "Unable to verify",
  pending: "Not checked yet",
};

export const ROLE_LABELS: Record<string, string> = {
  citizen: "Citizen",
  inspector: "Inspector",
  supervisor: "Supervisor",
  manufacturer: "Manufacturer / Packer",
  retailer: "Retailer / Billing counter",
  authority_admin: "Authority administrator",
  system_admin: "System administrator",
};

export const ROLE_DESCRIPTIONS: Record<string, string> = {
  citizen: "Scan products, understand label declarations and report suspected issues.",
  inspector: "Carry out official inspections, apply the 2011 Rules and finalise reports.",
  supervisor: "Review inspections submitted by the field team and record a decision.",
  manufacturer: "Register products and batches in the registry and answer authority requests.",
  retailer: "Check a package against the registry at the billing counter.",
  authority_admin: "Manage the authority's team, offices, complaints and analytics.",
  system_admin: "Operate the platform across all authorities.",
};

/** Roles a member of the public may request; each still needs approval. */
export const REQUESTABLE_ROLES = [
  "inspector",
  "supervisor",
  "manufacturer",
  "retailer",
  "authority_admin",
] as const;


export function bandFromConfidence(c: number): "high" | "medium" | "low" | "none" {
  if (c <= 0) return "none";
  if (c >= 0.85) return "high";
  if (c >= 0.6) return "medium";
  return "low";
}

/** Parse a net-quantity declaration such as "500 g", "1.5 litre", "10 N". */
export interface ParsedQuantity {
  value: number;
  unit: string;
  /** normalised to grams or millilitres where possible */
  base: number | null;
  type: "weight" | "volume" | "length" | "area" | "number" | "unknown";
}

const UNIT_MAP: Record<string, { type: ParsedQuantity["type"]; factor: number }> = {
  mg: { type: "weight", factor: 0.001 },
  g: { type: "weight", factor: 1 },
  gm: { type: "weight", factor: 1 },
  gms: { type: "weight", factor: 1 },
  gram: { type: "weight", factor: 1 },
  grams: { type: "weight", factor: 1 },
  kg: { type: "weight", factor: 1000 },
  kgs: { type: "weight", factor: 1000 },
  ml: { type: "volume", factor: 1 },
  l: { type: "volume", factor: 1000 },
  ltr: { type: "volume", factor: 1000 },
  litre: { type: "volume", factor: 1000 },
  litres: { type: "volume", factor: 1000 },
  liter: { type: "volume", factor: 1000 },
  liters: { type: "volume", factor: 1000 },
  mm: { type: "length", factor: 1 },
  cm: { type: "length", factor: 10 },
  m: { type: "length", factor: 1000 },
  cm2: { type: "area", factor: 1 },
  m2: { type: "area", factor: 10000 },
  n: { type: "number", factor: 1 },
  no: { type: "number", factor: 1 },
  nos: { type: "number", factor: 1 },
  number: { type: "number", factor: 1 },
  pcs: { type: "number", factor: 1 },
  pieces: { type: "number", factor: 1 },
  u: { type: "number", factor: 1 },
};

export function parseQuantity(raw: string | null | undefined): ParsedQuantity | null {
  if (!raw) return null;
  const cleaned = raw.toLowerCase().replace(/,/g, "").replace(/\s+/g, " ").trim();
  const m = cleaned.match(
    /(\d+(?:\.\d+)?)\s*(mg|kgs|kg|gms|gms|gm|grams|gram|g|ml|litres|litre|liters|liter|ltr|l|mm|cm2|cm|m2|m|nos|no|n|number|pieces|pcs|u)\b/,
  );
  if (!m) return null;
  const value = Number(m[1]);
  const unit = m[2]!;
  const info = UNIT_MAP[unit];
  if (!info || !Number.isFinite(value)) return null;
  return { value, unit, base: value * info.factor, type: info.type };
}

// ---------------------------------------------------------------------------
// Product registry vocabulary
// ---------------------------------------------------------------------------

export type ProductStatus = "draft" | "submitted" | "active" | "suspended" | "rejected";

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  draft: "Draft",
  submitted: "Submitted for review",
  active: "Active in registry",
  suspended: "Suspended",
  rejected: "Changes requested",
};

export const PRODUCT_STATUS_HINTS: Record<ProductStatus, string> = {
  draft: "Only visible to you. Add declarations and a label image, then submit.",
  submitted: "Waiting for an authority reviewer. You can still add batches.",
  active: "Discoverable by barcode lookup, billing counters and inspectors.",
  suspended: "Withdrawn from lookup. Historical inspections keep their evidence.",
  rejected: "A reviewer asked for corrections. Update the record and resubmit.",
};

export type BatchStatus = "draft" | "submitted" | "active" | "recalled" | "closed";

export const BATCH_STATUS_LABELS: Record<BatchStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  active: "Active",
  recalled: "Recalled",
  closed: "Closed",
};

export const BATCH_STATUS_HINTS: Record<BatchStatus, string> = {
  draft: "Not yet submitted to the registry.",
  submitted: "Submitted and awaiting authority acknowledgement.",
  active: "In circulation and used for package comparison.",
  recalled: "Recalled by the manufacturer.",
  closed: "Production run finished; kept for traceability.",
};

export type RegistryMatch =
  | "barcode_absent"
  | "barcode_unknown"
  | "product_found_batch_unknown"
  | "batch_found"
  | "match"
  | "mismatch"
  | "review"
  | "insufficient_evidence";

export const REGISTRY_MATCH_LABELS: Record<RegistryMatch, string> = {
  barcode_absent: "No barcode on package",
  barcode_unknown: "Barcode not in registry",
  product_found_batch_unknown: "Product found, batch unknown",
  batch_found: "Product and batch found",
  match: "Package matches registry",
  mismatch: "Package differs from registry",
  review: "Registry comparison needs review",
  insufficient_evidence: "Not enough package evidence to compare",
};

export const REGISTRY_MATCH_HINTS: Record<RegistryMatch, string> = {
  barcode_absent: "No barcode was scanned or entered, so the package was identified from the label only.",
  barcode_unknown:
    "This barcode is not registered. That is not an offence by itself — many lawful packs are not in the registry.",
  product_found_batch_unknown:
    "The product is registered but the batch or lot number on the package is not on record.",
  batch_found: "The product and the batch printed on the package are both on record.",
  match: "Every comparable declaration on the package agrees with the registered record.",
  mismatch:
    "One or more declarations on the package differ from the registered record. A person must review this before any conclusion is drawn.",
  review:
    "The comparison was inconclusive — usually because a reading was uncertain. A person should confirm it.",
  insufficient_evidence: "Too few declarations were read from the package to make a comparison.",
};

export type RetailAlert =
  | "verified"
  | "potential_mismatch"
  | "review_required"
  | "product_not_found"
  | "registry_unavailable";

export const RETAIL_ALERT_LABELS: Record<RetailAlert, string> = {
  verified: "Verified — no flag",
  potential_mismatch: "Potential mismatch",
  review_required: "Review required",
  product_not_found: "Product not found",
  registry_unavailable: "Registry unavailable (offline)",
};

export const RETAIL_ALERT_HINTS: Record<RetailAlert, string> = {
  verified: "This barcode resolves to an active registry record with no open flags.",
  potential_mismatch:
    "A previous scan of this product reported package data that differs from the registry. Check the pack before selling.",
  review_required: "This product has an open review with the authority. Check the pack before selling.",
  product_not_found:
    "This barcode is not in the registry. Many lawful products are not registered — this is not proof of an offence.",
  registry_unavailable:
    "The registry could not be reached. The result shown is from the last cached lookup on this device, if any.",
};

export type SyncState = "synced" | "pending" | "processing" | "failed";

export const SYNC_LABELS: Record<SyncState, string> = {
  synced: "Synced",
  pending: "Sync pending",
  processing: "Processing",
  failed: "Sync failed",
};

export type OcrStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "not_configured"
  | "skipped";

export const OCR_STATUS_LABELS: Record<OcrStatus, string> = {
  pending: "Not read yet",
  processing: "Reading",
  succeeded: "Text read",
  failed: "Reading failed",
  not_configured: "Reader not configured",
  skipped: "Reading skipped",
};

/** Declarations compared between a registered product and a physical package. */
export const COMPARABLE_FIELDS: FieldKey[] = [
  "commodity_name",
  "manufacturer_name",
  "net_quantity",
  "mrp",
  "country_of_origin",
  "batch_number",
];

/** Normalises a scanned barcode for lookup: digits/letters only, upper case. */
export function normaliseBarcode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  return cleaned.length >= 6 && cleaned.length <= 32 ? cleaned : null;
}

/** Money as printed on Indian packages: "MRP Rs. 45.00 (incl. of all taxes)". */
export function parseMoney(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = raw.replace(/,/g, "").match(/(\d+(?:\.\d{1,2})?)/);
  if (!m) return null;
  const value = Number(m[1]);
  return Number.isFinite(value) ? value : null;
}

/** Loose text comparison used for names printed in varying styles. */
export function looseTextEqual(a: string | null | undefined, b: string | null | undefined) {
  const norm = (v: string | null | undefined) =>
    (v ?? "")
      .toLowerCase()
      .replace(/\b(pvt|private|ltd|limited|llp|inc|co|company|india|foods|industries)\b/g, "")
      .replace(/[^a-z0-9]/g, "");
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.length > 4 && nb.length > 4 && (na.includes(nb) || nb.includes(na));
}

// ---------------------------------------------------------------------------
// Dates — always rendered from the stored timestamp, in the reader's own time
// ---------------------------------------------------------------------------

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "9 Sep 2026, 14:16" */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "9 Sep 2026" */
export function formatDate(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** "just now", "2 hours ago", "3 days ago" */
export function relativeTime(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  const seconds = Math.round((Date.now() - d.getTime()) / 1000);
  const future = seconds < 0;
  const s = Math.abs(seconds);
  const units: [number, string][] = [
    [60, "second"],
    [3600, "minute"],
    [86_400, "hour"],
    [604_800, "day"],
    [2_592_000, "week"],
    [31_536_000, "month"],
  ];
  if (s < 45) return future ? "in a moment" : "just now";
  let label = "year";
  let amount = Math.round(s / 31_536_000);
  if (s < 3600) {
    label = "minute";
    amount = Math.round(s / 60);
  } else if (s < 86_400) {
    label = "hour";
    amount = Math.round(s / 3600);
  } else if (s < 604_800) {
    label = "day";
    amount = Math.round(s / 86_400);
  } else if (s < 2_592_000) {
    label = "week";
    amount = Math.round(s / 604_800);
  } else if (s < 31_536_000) {
    label = "month";
    amount = Math.round(s / 2_592_000);
  }
  void units;
  const plural = `${amount} ${label}${amount === 1 ? "" : "s"}`;
  return future ? `in ${plural}` : `${plural} ago`;
}

/** "9 Sep 2026, 14:16 · 2 hours ago" */
export function formatWhen(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  return `${formatDateTime(d)} · ${relativeTime(d)}`;
}

/** Whole days since the timestamp — used for "age" chips on queues. */
export function ageInDays(value: string | number | Date | null | undefined): number | null {
  const d = toDate(value);
  if (!d) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
}
