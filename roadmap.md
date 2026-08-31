# SCANOVA-AI (ScanSight Compliance Hub) — build roadmap

Legal source of truth: `user-uploads://9_The_Legal_Metrology_Package_Commodities_Rules_2011.pdf`
(43 pages). Rules are only ever derived from that document; unsupported
requirements are marked MANUAL VERIFICATION REQUIRED.

## Open

- [ ] 1. Security & role hardening (signup cannot self-grant privileged roles;
      invitation/provisioning workflow; authority isolation; finalized-record
      protection; authority-scoped complaints and audit reads)
- [ ] 2. Product / SKU / barcode registry (products, product_barcodes,
      product_declarations, registry evidence, public projection)
- [ ] 3. Real OCR pipeline (Google Cloud Vision primary behind a provider
      abstraction, on-device Tesseract fallback, honest configuration state,
      ocr_results persistence, AI structuring from OCR text)
- [ ] 4. Image preprocessing (orientation, resize, contrast, sharpen, blur
      detection) with original evidence preserved separately
- [ ] 5. Manufacturer product + batch workflow (company profile, SKU, barcodes,
      declarations, representative evidence, batches, submissions, authority
      requests + responses)
- [ ] 6. Inspector workflow upgrades (AI-suggested vs inspector-confirmed
      category, registry comparison, capture state from images, supervisor
      review schema fix, correction diff + recheck)
- [ ] 7. Evidence experience (per-rule "view evidence", OCR region highlight)
- [ ] 8. Offline-first PWA (service worker, IndexedDB blobs, offline
      inspections, idempotent sync with backoff and failure states)
- [ ] 9. Citizen guest scan (no login) + public complaint submission and
      tracking
- [ ] 10. Retail / billing counter workflow (retailer role, fast lookup,
      alerts, hold for review)
- [ ] 11. Authority management (offices, members, role grants, requests)
- [ ] 12. Reports upgrade (batch, registry comparison, OCR provenance, evidence)
- [ ] 13. Real dashboards + charts + filters + map
- [ ] 14. Notifications with honest delivery/configuration status
- [ ] 15. Rule library (read-only, source-referenced) page
- [ ] 16. End-to-end verification pass + security scan

## Done

(nothing yet in this run)
