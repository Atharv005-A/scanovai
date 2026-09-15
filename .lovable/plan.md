# Downloadable PDF after a public scan (and after filing a report)

## About tracking

Tracking already works: a filed report returns a tracking code, the tracking page looks it up through a secure server lookup, and it shows the code, product, status, priority, dates, outcome note and the public progress steps. Nothing is broken there — the only weakness is that a visitor who loses the code has no other way in, so the new PDF will carry the code.

## What gets added

### 1. "Download PDF" on the scan result
After a package check on the scan page, a **Download PDF report** button appears next to the existing actions. It produces a well-structured document containing:

- Header: SCANOVA-AI, document title, reference number of the scan, date and time of the check
- Clear notice that this is a preliminary consumer check, not an official government finding
- Package identity: barcode, chosen category, detected category
- Registry comparison: whether the barcode matched a registered product, the headline, and a table of registry value vs. what was printed
- Declarations read from the pack: field, value, confidence band (High / Medium / Low)
- Items not found in the photographs
- Overall reading with counts (pass, fail, needs review, manual check)
- Rule-by-rule table: rule number, title, result, explanation, source section and PDF page
- Footer on every page: reference, page x of y, rule set used and source document

### 2. "Download PDF" on the filed-report confirmation
The screen shown after a report is submitted gets the same button. That document is a complaint acknowledgement: complaint number, tracking code, date filed, product, manufacturer, barcode, what was reported, place/coordinates, whether a photo was attached, and a short "what happens next / how to track" note. Also reachable from the tracking page for any code, so the current status and progress trail can be saved or printed.

## Technical notes

- New `src/lib/public-pdf.ts` with `buildScanPdf(result, meta)` and `buildComplaintPdf(payload)`, using the already-installed `jsPDF` and the same layout helpers/style as `src/lib/report-pdf.ts` (heading / row / paragraph helpers, navy header band, page footers). No new dependency.
- `src/routes/scan.tsx`: keeps the scan input state (barcode, category, shot count) plus `checkM.data`, passes them to `buildScanPdf`, saves as `scanova-check-<scanCode>.pdf`. Button only rendered when OCR succeeded.
- `src/routes/report.tsx`: on the success card, builds the acknowledgement from the local form values plus returned `code`/`trackingToken`; filename `scanova-complaint-<code>.pdf`.
- `src/routes/track.tsx`: a download button on the returned complaint card, built from the `trackPublicComplaint` payload (code, status, dates, resolution note, public updates).
- Confidence bands reuse the existing labels in `src/lib/domain.ts` (`FIELD_LABELS`, result labels) so wording matches the screens.
- No database, server function or rule-engine change; generation happens in the browser from data already returned.
