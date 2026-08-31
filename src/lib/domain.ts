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

export const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.value, c.label]),
);

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
  authority_admin: "Authority administrator",
  system_admin: "System administrator",
};

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
