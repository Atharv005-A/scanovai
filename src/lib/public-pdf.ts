import jsPDF from "jspdf";

import { CATEGORY_LABELS, FIELD_LABELS, RESULT_LABELS, OVERALL_LABELS, REGISTRY_MATCH_LABELS } from "@/lib/domain";

const NAVY: [number, number, number] = [20, 33, 61];

interface Doc {
  doc: jsPDF;
  M: number;
  W: number;
  H: number;
  y: number;
}

function start(title: string, subtitle: string, reference: string) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const M = 44;
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 76, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("SCANOVA-AI", M, 30);
  doc.setFontSize(11);
  doc.text(title, M, 48);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(subtitle, M, 64);
  doc.text(reference, W - M, 30, { align: "right" });
  doc.setTextColor(30);
  return { doc, M, W, H, y: 100 } as Doc;
}

function ensure(d: Doc, space = 60) {
  if (d.y + space > d.H - d.M) {
    d.doc.addPage();
    d.y = d.M;
  }
}

function heading(d: Doc, text: string) {
  d.y += 10;
  ensure(d, 56);
  d.doc.setFont("helvetica", "bold");
  d.doc.setFontSize(12);
  d.doc.setTextColor(...NAVY);
  d.doc.text(text, d.M, d.y);
  d.y += 7;
  d.doc.setDrawColor(220);
  d.doc.line(d.M, d.y, d.W - d.M, d.y);
  d.y += 14;
  d.doc.setTextColor(30);
}

function row(d: Doc, label: string, value: string) {
  ensure(d, 22);
  d.doc.setFont("helvetica", "bold");
  d.doc.setFontSize(9);
  d.doc.text(label, d.M, d.y);
  d.doc.setFont("helvetica", "normal");
  const lines = d.doc.splitTextToSize(value || "—", d.W - d.M - 200) as string[];
  d.doc.text(lines, d.M + 160, d.y);
  d.y += Math.max(14, lines.length * 12);
}

function para(d: Doc, text: string, size = 8.5) {
  d.doc.setFont("helvetica", "normal");
  d.doc.setFontSize(size);
  const lines = d.doc.splitTextToSize(text, d.W - d.M * 2) as string[];
  ensure(d, lines.length * 12 + 6);
  d.doc.text(lines, d.M, d.y);
  d.y += lines.length * 12 + 4;
}

function footers(d: Doc, left: string, right: string) {
  const pages = d.doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    d.doc.setPage(p);
    d.doc.setFontSize(7.5);
    d.doc.setTextColor(130);
    d.doc.text(`${left} · page ${p} of ${pages}`, d.M, d.H - 22);
    d.doc.text(right, d.W - d.M, d.H - 22, { align: "right" });
    d.doc.setTextColor(30);
  }
}

function band(confidence: number) {
  if (confidence >= 0.85) return "High";
  if (confidence >= 0.6) return "Medium";
  return "Low";
}

export interface ScanPdfInput {
  scanCode: string | null;
  disclaimer: string;
  ocr: { status: string; provider: string; meanConfidence: number | null; wordCount: number };
  declarations: { field_key: string; value: string | null; confidence: number }[];
  missing?: string[];
  registry:
    | { match: string; headline: string; differing: { label: string; registry_value: string | null; observed_value: string | null }[] }
    | null;
  assessment:
    | {
        overall: string | null;
        score: number | null;
        counts: Record<string, number>;
        items: {
          rule_number: string;
          title: string;
          result: string;
          explanation: string;
          detected_value?: string | null;
          source_section: string | null;
          source_page: number | null;
        }[];
        rule_version: string | null;
        source_document: string | null;
      }
    | null;
}

/** Consumer-facing PDF of a public package check. */
export function buildScanPdf(
  result: ScanPdfInput,
  meta: { barcode: string | null; category: string | null; detectedCategory?: string | null; photoCount: number },
): jsPDF {
  const reference = result.scanCode ? `Reference ${result.scanCode}` : "Unsaved check";
  const d = start(
    "Preliminary package check",
    "Legal Metrology (Packaged Commodities) Rules, 2011 — consumer reading",
    reference,
  );

  heading(d, "About this document");
  para(d, result.disclaimer);
  row(d, "Checked on", new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }));
  row(d, "Reference", result.scanCode ?? "—");

  heading(d, "Package");
  row(d, "Barcode", meta.barcode ?? "not supplied");
  row(
    d,
    "Category chosen",
    meta.category ? (CATEGORY_LABELS[meta.category] ?? meta.category) : "detect automatically",
  );
  if (meta.detectedCategory)
    row(d, "Category detected", CATEGORY_LABELS[meta.detectedCategory] ?? meta.detectedCategory);
  row(d, "Photographs used", String(meta.photoCount));
  row(d, "Text reader", result.ocr.provider);
  row(
    d,
    "Reading confidence",
    result.ocr.meanConfidence == null
      ? "—"
      : `${Math.round(result.ocr.meanConfidence * 100)}% over ${result.ocr.wordCount} words`,
  );

  if (result.registry) {
    heading(d, "Comparison with the product registry");
    row(d, "Match", REGISTRY_MATCH_LABELS[result.registry.match as never] ?? result.registry.match);
    para(d, result.registry.headline);
    for (const diff of result.registry.differing) {
      row(d, diff.label, `Registered: ${diff.registry_value ?? "—"}\nOn the pack: ${diff.observed_value ?? "—"}`);
    }
  }

  heading(d, "Declarations read from the pack");
  if (result.declarations.length === 0) para(d, "No declarations could be read from the photographs.");
  for (const dec of result.declarations) {
    row(
      d,
      FIELD_LABELS[dec.field_key] ?? dec.field_key,
      `${dec.value ?? "not detected"}  (${band(dec.confidence)} confidence, ${Math.round(dec.confidence * 100)}%)`,
    );
  }
  if ((result.missing ?? []).length > 0) {
    para(
      d,
      `Not found in the photographs: ${(result.missing ?? [])
        .map((m) => FIELD_LABELS[m] ?? m)
        .join(", ")}. A missing reading is not by itself proof of a breach — the print may simply be unclear in the photograph.`,
    );
  }

  const a = result.assessment;
  if (a) {
    heading(d, "Overall reading");
    row(d, "Result", a.overall ? (OVERALL_LABELS[a.overall] ?? a.overall) : "—");
    row(d, "Checks passed", a.score == null ? "—" : `${a.score}%`);
    row(
      d,
      "Counts",
      `Pass ${a.counts["pass"] ?? 0} · Fail ${a.counts["fail"] ?? 0} · Needs review ${
        a.counts["needs_review"] ?? 0
      } · Manual check ${a.counts["manual"] ?? 0} · Unable to verify ${a.counts["unable_to_verify"] ?? 0}`,
    );
    row(d, "Rule set", a.rule_version ?? "—");
    row(d, "Source document", a.source_document ?? "Legal Metrology (Packaged Commodities) Rules, 2011");

    heading(d, "Rule-by-rule reading");
    for (const item of a.items) {
      ensure(d, 70);
      d.doc.setFont("helvetica", "bold");
      d.doc.setFontSize(9.5);
      d.doc.text(`${item.rule_number} — ${item.title}`, d.M, d.y);
      d.y += 13;
      d.doc.setFontSize(9);
      d.doc.text(`Result: ${RESULT_LABELS[item.result as never] ?? item.result}`, d.M, d.y);
      d.y += 12;
      d.doc.setFont("helvetica", "normal");
      d.doc.setFontSize(8.5);
      const detail = [
        item.detected_value ? `Detected: ${item.detected_value}` : null,
        `Explanation: ${item.explanation}`,
        `Source: ${item.source_section ?? "—"}${item.source_page ? `, PDF page ${item.source_page}` : ""}`,
      ]
        .filter(Boolean)
        .join("\n");
      const lines = d.doc.splitTextToSize(detail, d.W - d.M * 2) as string[];
      ensure(d, lines.length * 10 + 8);
      d.doc.text(lines, d.M, d.y);
      d.y += lines.length * 10 + 12;
    }
  }

  heading(d, "What you can do next");
  para(
    d,
    "If something on the pack looks wrong, report it to the authority from the SCANOVA-AI reporting page. You will get a tracking code and an officer will review the report. This document is a consumer reading only and carries no legal finding.",
  );

  footers(d, reference, "SCANOVA-AI · preliminary consumer check");
  return d.doc;
}

export interface ComplaintPdfInput {
  code: string;
  trackingToken: string;
  productName: string;
  manufacturerName?: string | null;
  barcode?: string | null;
  description: string;
  region?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  hasPhoto?: boolean;
  filedAt?: string | null;
  status?: string | null;
  priority?: string | null;
  updatedAt?: string | null;
  resolutionNote?: string | null;
  updates?: { status?: string; note?: string; created_at?: string }[];
}

/** Acknowledgement / status copy of a citizen complaint. */
export function buildComplaintPdf(input: ComplaintPdfInput): jsPDF {
  const d = start(
    "Complaint record",
    "Packaged commodity labelling complaint filed with the authority",
    `Complaint ${input.code}`,
  );

  heading(d, "Complaint");
  row(d, "Complaint number", input.code);
  row(d, "Tracking code", input.trackingToken);
  row(
    d,
    "Filed on",
    input.filedAt
      ? new Date(input.filedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
      : new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
  );
  if (input.status) row(d, "Current status", input.status.replace(/_/g, " "));
  if (input.priority) row(d, "Priority", input.priority);
  if (input.updatedAt)
    row(d, "Last update", new Date(input.updatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }));

  heading(d, "Package reported");
  row(d, "Product", input.productName);
  row(d, "Manufacturer / packer", input.manufacturerName || "not stated");
  row(d, "Barcode", input.barcode || "not supplied");
  row(d, "Photograph attached", input.hasPhoto ? "Yes" : "No");

  heading(d, "What was reported");
  para(d, input.description, 9);

  heading(d, "Where it was seen");
  row(d, "Place", input.region || "not stated");
  row(
    d,
    "Coordinates",
    input.latitude != null && input.longitude != null
      ? `${input.latitude.toFixed(5)}, ${input.longitude.toFixed(5)}`
      : "not attached",
  );

  if (input.resolutionNote) {
    heading(d, "Outcome recorded by the authority");
    para(d, input.resolutionNote, 9);
  }

  if ((input.updates ?? []).length > 0) {
    heading(d, "Progress");
    for (const u of input.updates ?? []) {
      row(
        d,
        (u.status ?? "update").replace(/_/g, " "),
        `${u.note ?? "—"}${
          u.created_at
            ? `\n${new Date(u.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`
            : ""
        }`,
      );
    }
  }

  heading(d, "What happens next");
  para(
    d,
    "An officer reviews every report; the system never closes one automatically. Keep the tracking code above — entering it on the SCANOVA-AI tracking page shows the current status and every recorded step, without an account.",
  );

  footers(d, `Complaint ${input.code}`, "SCANOVA-AI · complaint record");
  return d.doc;
}
