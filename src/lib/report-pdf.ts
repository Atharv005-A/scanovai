import jsPDF from "jspdf";

import { RESULT_LABELS, OVERALL_LABELS, FIELD_LABELS, CATEGORY_LABELS } from "@/lib/domain";

interface Payload {
  inspection: Record<string, unknown>;
  inspector: { full_name?: string; email?: string; designation?: string | null } | null;
  authority: { name: string; code: string } | null;
  checks: Record<string, unknown>[];
  declarations: Record<string, unknown>[];
  images: Record<string, unknown>[];
  corrections: Record<string, unknown>[];
  rule_version: { label: string; source_document: string };
  generated_at: string;
}

/** Renders the immutable report payload to a downloadable PDF. */
export function buildReportPdf(
  payload: Payload,
  meta: { report_code: string; checksum: string },
): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const M = 44;
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  let y = M;

  const ins = payload.inspection as Record<string, string | number | null>;

  function ensure(space = 60) {
    if (y + space > H - M) {
      doc.addPage();
      y = M;
    }
  }
  function heading(text: string) {
    y += 12;
    ensure(60);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(20, 33, 61);
    doc.text(text, M, y);
    y += 8;
    doc.setDrawColor(220);
    doc.line(M, y, W - M, y);
    y += 14;
    doc.setTextColor(30);
  }
  function row(label: string, value: string) {
    ensure(22);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(label, M, y);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(value || "—", W - M - 190);
    doc.text(lines, M + 150, y);
    y += Math.max(14, lines.length * 12);
  }
  function para(text: string, size = 9) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, W - M * 2);
    ensure(lines.length * 12 + 6);
    doc.text(lines, M, y);
    y += lines.length * 12 + 4;
  }

  // Title block
  doc.setFillColor(20, 33, 61);
  doc.rect(0, 0, W, 76, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("SCANOVA-AI Inspection Report", M, 34);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    "Legal Metrology (Packaged Commodities) Rules, 2011 — compliance assessment",
    M,
    52,
  );
  doc.text(`Report ${meta.report_code}`, M, 66);
  doc.setTextColor(30);
  y = 104;

  heading("Inspection");
  row("Reference", String(ins["reference_code"] ?? ""));
  row("Status", String(ins["status"] ?? ""));
  row("Overall result", OVERALL_LABELS[String(ins["result"])] ?? String(ins["result"] ?? ""));
  row(
    "Automated checks passed",
    ins["assessment_score"] === null || ins["assessment_score"] === undefined
      ? "—"
      : `${ins["assessment_score"]}%`,
  );
  row("Category", CATEGORY_LABELS[String(ins["category"])] ?? String(ins["category"] ?? ""));
  row("Product", String(ins["product_name"] ?? "—"));
  row("Manufacturer / packer", String(ins["manufacturer_name"] ?? "—"));
  row("Barcode", String(ins["barcode"] ?? "—"));
  row("Place", String(ins["location_label"] ?? "—"));
  if (ins["latitude"] && ins["longitude"])
    row("Coordinates", `${ins["latitude"]}, ${ins["longitude"]}`);
  row("Created", new Date(String(ins["created_at"])).toLocaleString());
  if (ins["finalized_at"]) row("Finalized", new Date(String(ins["finalized_at"])).toLocaleString());
  if (ins["is_demo"]) row("Record type", "DEMO RECORD — not an enforcement record");

  heading("Authority and inspector");
  row("Authority", payload.authority ? `${payload.authority.name} (${payload.authority.code})` : "—");
  row("Inspector", payload.inspector?.full_name ?? "—");
  row("Contact", payload.inspector?.email ?? "—");
  if (payload.inspector?.designation) row("Designation", payload.inspector.designation);

  heading("Declarations read from the package");
  if (payload.declarations.length === 0) para("No declarations were recorded.");
  for (const d of payload.declarations) {
    const key = String(d["field_key"]);
    const conf = Number(d["confidence"] ?? 0);
    const suffix = `${d["corrected"] ? " [corrected by inspector]" : ""}${
      conf > 0 ? ` (${Math.round(conf * 100)}% confidence)` : " (not read)"
    }`;
    row(FIELD_LABELS[key] ?? key, `${d["value"] ? String(d["value"]) : "not detected"}${suffix}`);
  }

  heading("Rule-by-rule assessment");
  for (const c of payload.checks) {
    ensure(80);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.text(`${String(c["rule_number"])} — ${String(c["title"])}`, M, y);
    y += 13;
    doc.setFont("helvetica", "bold");
    const result = String(c["result"]);
    doc.text(`Result: ${RESULT_LABELS[result as never] ?? result}`, M, y);
    y += 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const detail = [
      `Requirement: ${String(c["requirement"] ?? "")}`,
      `Detected: ${c["detected_value"] ? String(c["detected_value"]) : "—"}`,
      `Expected: ${c["expected_condition"] ? String(c["expected_condition"]) : "—"}`,
      `Explanation: ${String(c["explanation"] ?? "")}`,
      `Source: ${String(c["source_section"] ?? "")}${c["source_page"] ? `, PDF page ${c["source_page"]}` : ""}`,
    ].join("\n");
    const lines = doc.splitTextToSize(detail, W - M * 2);
    ensure(lines.length * 10 + 8);
    doc.text(lines, M, y);
    y += lines.length * 10 + 12;
  }

  if (payload.corrections.length > 0) {
    heading("Correction history");
    for (const c of payload.corrections) {
      row(
        FIELD_LABELS[String(c["field_key"])] ?? String(c["field_key"]),
        `“${String(c["previous_value"] ?? "—")}” → “${String(c["new_value"] ?? "—")}”\nReason: ${
          c["reason"] ? String(c["reason"]) : "not stated"
        }\nAt: ${new Date(String(c["created_at"])).toLocaleString()}`,
      );
    }
  }

  heading("Notes and decision");
  row("Inspector notes", String(ins["inspector_notes"] ?? "—"));
  row("Supervisor notes", String(ins["supervisor_notes"] ?? "—"));
  row("Supervisor decision", String(ins["supervisor_decision"] ?? "not requested"));

  heading("Evidence and traceability");
  row("Images captured", String(payload.images.length));
  row("Rule version", payload.rule_version.label || "—");
  row("Source document", payload.rule_version.source_document || "—");
  row("Report ID", meta.report_code);
  row("Payload checksum (SHA-256)", meta.checksum);
  row("Generated at", new Date(payload.generated_at).toLocaleString());

  para(
    "This report records an assessment produced by automated reading of the package label combined with a deterministic rule engine derived solely from the Legal Metrology (Packaged Commodities) Rules, 2011. Items marked as requiring manual verification were not judged automatically and must be assessed by an authorized officer. The assessment is advisory; the enforcement decision rests with the authority.",
    8,
  );

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5);
    doc.setTextColor(130);
    doc.text(`${meta.report_code} · page ${p} of ${pages}`, M, H - 22);
    doc.text("SCANOVA-AI", W - M, H - 22, { align: "right" });
  }

  return doc;
}
