# Working scanner + simpler inspection

Two problems to fix: the barcode scanner never produces a reading, and the inspection flow asks for a very detailed product category (30 options like "Ice cream", "Biscuits") before anything else.

## 1. Make the scanner actually work

- Use the browser's built-in barcode detection first (fast, no download), and fall back to the bundled ZXing reader when the browser lacks it.
- Fix the camera element itself: it currently never starts playing, so nothing is ever decoded. It will be muted, inline, auto-playing, rear-camera by default, with a proper start/stop lifecycle and cleanup when the panel closes.
- Honest error messages instead of silence: separate "camera permission denied", "no camera found", and "camera needs a secure connection", each with the manual-entry box right there.
- Show a live "scanning…" state and a visible frame guide, and confirm the read with the decoded number.
- Same scanner component used on the public check page and inside an inspection, so an inspector can scan the barcode from the inspection screen.

## 2. Reading the label without extra setup

Photo checks currently return "text could not be read" because the external OCR key is not configured. The label reader will use the built-in Lovable AI vision model as the default server-side text reader, so it works out of the box:

- Default engine: Lovable AI vision transcription (no key needed).
- If a Google Vision key is added later, that is used automatically as the primary engine.
- On-device Tesseract stays as the offline/fallback path.
- The result panel always names which engine read the label, and low-confidence readings still go to review rather than being reported as violations.

## 3. Simple inspection

- Category question becomes six plain choices: Food & drink, Personal care & cosmetics, Household & cleaning, Building & industrial, Clothing & textiles, Other packaged goods. Plus "detect from the label" as the default.
- The detailed 30-item list stays available behind an optional "specific product type" field for inspectors who want schedule-level checks; it is never required.
- Inspection screen collapses to one page: category -> photos (front, back, declaration close-up) -> Check compliance -> results -> finalize. No separate confirm/extract steps to click through.
- Checks that genuinely need the specific product type (schedule quantity ranges) report "Manual verification required" with a short note, instead of blocking the inspection.

## Technical notes

- `src/components/image-capture.tsx`: rewrite `BarcodeScanner` with `BarcodeDetector` primary, ZXing `BrowserMultiFormatReader` fallback, explicit `getUserMedia({ facingMode: "environment" })`, `video.play()`, unmount cleanup, and typed error states.
- `src/lib/ocr.server.ts`: add a `lovable_ai_vision` provider to `OCR_PROVIDERS` and the provider-selection chain; it calls the AI gateway for a verbatim transcription and returns `OcrBlock`s (whole-image bbox, model-reported confidence clamped to a conservative band). Provider order: Google Vision key -> Lovable AI vision -> device Tesseract. `not_configured` remains only if all fail.
- `src/lib/domain.ts`: add `CATEGORY_GROUPS` (six broad values) and a `groupForCategory` map; keep `CATEGORIES` for the optional specific type. `inspection.functions.ts` and `public.functions.ts` validators accept both group and specific values.
- `src/lib/rule-engine.ts`: applicability resolves a broad group to "all Rule 6 mandatory declarations apply"; schedule-specific rules return `manual_verification_required` when only the group is known.
- UI: `src/routes/_authenticated/inspections.new.tsx` and `inspections.$id.tsx` simplified to the single-page flow; `src/routes/scan.tsx` category select switched to the six groups.
- No database migration needed — `category` stays a text column and existing rows keep their specific values.
