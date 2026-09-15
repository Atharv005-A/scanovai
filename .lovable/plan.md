# Scan/complaint PDF reports + better dashboard charts

## About tracking

Tracking already works: a filed report returns a tracking code, the tracking page looks it up through a secure server lookup, and it shows the code, product, status, priority, dates, outcome note and the public progress steps. The only weakness is that a visitor who loses the code has no other way in — so the new PDF will carry the code.

## Part 1 — Downloadable PDF after a scan

### "Download PDF" on the scan result
After a package check on the scan page, a **Download PDF report** button appears next to the existing actions. The document contains:

- Header: SCANOVA-AI, document title, scan reference number, date and time of the check
- Clear notice that this is a preliminary consumer check, not an official government finding
- Package identity: barcode, chosen category, detected category
- Registry comparison: whether the barcode matched a registered product, the headline, and registry value vs. what was printed
- Declarations read from the pack: field, value, confidence band (High / Medium / Low)
- Items not found in the photographs
- Overall reading with counts (pass, fail, needs review, manual check)
- Rule-by-rule table: rule number, title, result, explanation, source section and PDF page
- Footer on every page: reference, page x of y, rule set used and source document

### "Download PDF" on the filed-report confirmation
The screen shown after a report is submitted gets the same button — a complaint acknowledgement with complaint number, tracking code, date filed, product, manufacturer, barcode, what was reported, place/coordinates, whether a photo was attached, and a short "what happens next / how to track" note. The tracking page gets the same button, so the current status and progress trail can be saved or printed.

## Part 2 — Better charts across all dashboards

The charts on the inspector, government and supervisor screens are plain and hard to read. Rework them so every chart is legible and consistent:

- One shared look for all charts: consistent height, generous margins, soft dotted gridlines, muted axis labels, no clutter.
- Trend lines become smooth filled area charts with a soft colour fade, visible dots and a readable date axis.
- The rule-failure and officer-output bars get full labels that no longer get cut off, rounded bar ends, value labels at the end of each bar, and one accent colour instead of rainbow bars.
- The result breakdown becomes a donut with a total in the middle, a proper legend with counts and percentages, and outcome colours matching the badges used elsewhere (pass green, fail red, review amber).
- Every chart gets a styled tooltip with plain-language labels and units.
- Empty and loading states: a short "no data for this period yet" line instead of an empty axis frame, and skeletons while loading.
- Charts become properly responsive so nothing overlaps on a narrow window.

## Technical notes

- New `src/lib/public-pdf.ts` with `buildScanPdf(result, meta)` and `buildComplaintPdf(payload)`, using the already-installed `jsPDF` and the same layout helpers/style as `src/lib/report-pdf.ts` (heading/row/paragraph helpers, navy header band, page footers). No new dependency.
- `src/routes/scan.tsx`: passes barcode/category/shot count plus `checkM.data` to `buildScanPdf`, saved as `scanova-check-<scanCode>.pdf`; button only when OCR succeeded.
- `src/routes/report.tsx`: builds the acknowledgement from local form values plus returned `code`/`trackingToken`; `scanova-complaint-<code>.pdf`.
- `src/routes/track.tsx`: download button on the returned complaint card, built from the `trackPublicComplaint` payload.
- Charts: new `src/components/charts.tsx` exporting `ChartFrame` (title, height, empty/loading handling), `TrendArea`, `RankedBars` and `OutcomeDonut`, all reading colours from semantic tokens in `src/styles.css` (add `--chart-1..5` / outcome tokens if missing — no hardcoded hex in components). Recharts stays the library; `AreaChart` with `linearGradient` fill, `CartesianGrid strokeDasharray` on the muted token, `Tooltip` via the existing `ChartTooltipContent` in `src/components/ui/chart.tsx`.
- Replace the inline chart JSX in `src/routes/_authenticated/inspector.tsx`, `government.tsx` and `supervisor.tsx` with these three components; data queries and server functions are untouched.
- No database, server function or rule-engine change.
