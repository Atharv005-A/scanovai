# SCANOVA-AI — Packaged Commodity Compliance & Inspection Platform

An AI-assisted inspection platform for checking packaged goods against the Legal Metrology (Packaged Commodities) Rules, 2011. Every compliance verdict traces back to a rule extracted from the attached official PDF.

This first build delivers the complete core inspection pipeline end to end. Dashboards/analytics, citizen complaints, manufacturer portal, and offline PWA sync follow in the next rounds (all four roles get working accounts and home screens now).

## What gets built in this round

**Foundation**
- Lovable Cloud backend: database, auth, private file storage.
- Real email signup/verification, resend, login, logout, forgot/reset password, session persistence. No fake OTPs.
- Roles in a separate `user_roles` table: citizen, inspector, supervisor, manufacturer, authority_admin, system_admin.
- Multi-authority structure: authority → department → office → members. Row-level security isolates each authority's inspections; citizens see only their own submissions.
- Audit log written on every meaningful action (inspection created, image uploaded, extraction run, correction made, rules run, finalized, report generated).

**Inspection pipeline (the heart of the app)**
A single guided flow with clear steps and no jargon:
1. **New inspection** — inspector, optional GPS, optional barcode.
2. **Capture images** — camera or upload, multiple sides (front / back / declaration close-up), preview, retake, rotate.
3. **Quality check** — blur/size/contrast check before extraction; poor images prompt a retake instead of a false verdict.
4. **Extract information** — AI vision reads the label and returns structured declarations, each with HIGH / MEDIUM / LOW confidence and the image it came from.
5. **Review information** — inspector sees detected / not detected / uncertain fields and can correct any value. Original value, correction, user, time, and reason are all stored.
6. **Check compliance** — deterministic rule engine, never the AI, decides PASS / FAIL / NEEDS REVIEW / NOT APPLICABLE / UNABLE TO VERIFY.
7. **Review results** — rule-by-rule cards: what was checked, detected value, expected condition, evidence image, confidence, and the exact rule and PDF page it came from.
8. **Finalize** — inspector notes and decision; evidence becomes immutable.
9. **Report** — PDF with images, declarations, rule-by-rule results, corrections, rule version, report ID and checksum.

Corrections automatically re-run the affected checks.

**Legal rule engine (from the attached PDF only)**
Rules stored as versioned database records, each with rule number, title, requirement text, applicable categories, conditions, exceptions, check type, parameters, and source PDF page. Coverage this round:
- Rule 6 — mandatory declarations on every package (name/address of manufacturer/packer/importer, common name of commodity, net quantity, month/year of manufacture or pre-packing, retail sale price as "Maximum Retail Price ₹ … inclusive of all taxes", consumer care details, country of origin for imports).
- Rule 8 / 9 — where and how declarations must appear (legibility, prominence, grouping, language, no obliteration).
- Rule 10 — manner of declaring name and address.
- Rule 11 — quantity declaration: valid units and symbols, numeral format, placement.
- Rule 18 — wholesale/retail dealer provisions.
- Rule 26 — exemptions (small packages, specified categories) applied as conditional checks so exempt packages are marked NOT APPLICABLE, not failed.
- Second Schedule — standard pack sizes per commodity (cereals, tea, milk powder, cement, etc.).
- Third Schedule — required unit of measure per commodity.

Anything in the PDF that cannot be safely automated is stored as **MANUAL VERIFICATION REQUIRED** rather than guessed. No rule is invented from outside the PDF. Historical inspections keep the rule version they were judged under.

**Barcode**
EAN-13/8, UPC, Code 128, QR scan or manual entry, used only to prefill and link a product. If the scanned/known data contradicts the package (e.g. MRP mismatch), the inspection raises an information-conflict flag requiring review.

**Roles at launch**
- Inspector — full pipeline, own inspection history, reports.
- Supervisor — team inspections, flagged and review queue, approve / reject / request more evidence, supervisory notes (cannot rewrite finalized evidence).
- Authority admin — authority profile, departments, offices, add/deactivate inspectors and supervisors, authority-wide inspection list.
- Citizen — scan/upload a product, submit a complaint with evidence and optional location, get a complaint ID, track status.
- Manufacturer — company profile and product catalogue with barcodes; read-only view of issues raised against their products.

**Design**
A calm, credible government-tool aesthetic: deep navy and a single amber accent for flags, generous spacing, large touch targets for field use on a phone, high-contrast status chips (PASS / FAIL / REVIEW). One consistent shell with a role-aware sidebar; the inspector flow is a full-width stepper. Semantic design tokens only, dark mode included.

**Demo data**
Clearly labelled DEMO records: a compliant pack, a missing-declaration pack, a barcode/package conflict, a low-confidence extraction, and a manual-review case, so the pipeline can be shown without a physical product.

## Technical notes

- TanStack Start; all AI, OCR, rule execution, report generation, and storage access happen in server functions — no keys in the browser.
- Extraction uses Lovable AI vision behind a provider-agnostic interface so another OCR engine can be added later without touching the rule engine.
- Tables: profiles, user_roles, authorities, departments, offices, authority_members, manufacturers, products, inspections, inspection_images, extractions, extracted_declarations, field_corrections, rule_definitions, rule_versions, compliance_checks, complaints, reports, notifications, audit_logs, sync_queue.
- Private storage buckets for images, evidence, and reports; access via signed URLs and RLS-backed policies only.
- `sync_queue` and stable client-generated inspection IDs are created now so the offline PWA layer in the next round plugs in without a schema change.
- Errors surface in plain language ("We couldn't read that label clearly — please retake the photo") and never as a fabricated success.

## Next rounds
1. Dashboards and analytics with real filtered data (trends, compliance distribution, top failing rules, categories, regions, map hotspots, OCR/AI performance).
2. Offline PWA: service worker, IndexedDB inspections and images, sync queue with retries and idempotent uploads, sync status indicators.
3. Complaint triage assistance, manufacturer analytics, notifications, security hardening and testing pass.
