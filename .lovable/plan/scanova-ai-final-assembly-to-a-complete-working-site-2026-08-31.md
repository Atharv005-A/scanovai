# SCANOVA-AI — final assembly to a complete, working site

The database, rule engine, OCR pipeline and all backend server functions are already
built and the build is green. What is missing is the front end for most of it: the
new backend modules (guest scan, retail counter, manufacturer registry, authority
admin, analytics dashboards) have no pages yet, offline sync is unfinished, and the
app is not installable as a PWA. This plan finishes those and does a final polish pass.

## 1. Public, no-login citizen area

- `/scan` — guest package check: photo capture or upload, barcode/QR entry, runs the
  backend OCR + preliminary rule evaluation, shows pass / fail / needs-review counts
  with the legal disclaimer and a link to file a complaint.
- `/report` — anonymous complaint form with evidence upload; returns a tracking token.
- `/track` — check a complaint status with the tracking token.
- `/rules` — read-only rule library: every check with its rule/section and PDF page
  reference, plus which items are MANUAL VERIFICATION REQUIRED.
- Landing page gets clear entry points for citizen (no login) vs staff sign-in.

## 2. Role workspaces (signed in)

- **Retail counter** `/retail` — open/close session, fast barcode scan, verified /
  mismatch / review alert, hold-for-review action, recent scans list.
- **Manufacturer** — extend `/products` into company profile, SKUs, barcodes,
  declarations, and production batches with submission status.
- **Authority admin** `/authority` — roster, role invitations, role requests
  approve/reject, offices.
- **Dashboards** — wire the real analytics functions per role (inspector, supervisor,
  authority, system admin): counts, trend charts, category and rule-failure
  breakdowns, filters, mismatch hotspots.
- **Notifications** — bell menu plus `/notifications` page, honest delivery status.
- Sidebar navigation updated per role, including the retailer role.

## 3. Offline-first PWA

- Finish `sync.functions.ts`: idempotent registration of offline inspections and
  images (client op ids), queue processing with retry/backoff and
  pending / processing / failed states.
- Service worker + web manifest + icons so the app installs and shells load offline.
- Offline indicator, queue badge, and a manual "sync now" action; inspections captured
  offline store images in IndexedDB and upload when connectivity returns.

## 4. Honest OCR status

Google Cloud Vision is the primary engine but no API key is configured yet, so the
pipeline falls back to on-device OCR. The UI will state which engine ran and, for
admins, show that Vision is not configured — no invented confidence. Adding the key
later needs no code change.

## 5. Final touches and verification

- Per-route SEO metadata (unique titles/descriptions, OG/Twitter tags), single H1s,
  alt text, accessible labels; mobile layout pass on every page.
- Empty states, loading states and error states on every new page; no dead buttons.
- Route-level checks that every nav item and link resolves.
- End-to-end pass in the browser: guest scan, complaint + tracking, inspector
  pipeline through finalize + PDF, retail scan, manufacturer batch, dashboards,
  offline queue; typecheck, build, and a security scan on the RLS surface.

## Technical notes

- New routes under `src/routes/` (public leaves) and `src/routes/_authenticated/`;
  no schema changes needed — all 37 tables and RPCs already exist.
- Pages consume the existing `*.functions.ts` server functions through TanStack Query
  loaders (`ensureQueryData` + `useSuspenseQuery`) so nothing new touches the client
  bundle boundaries.
- Public routes use the anonymous client path with the existing IP rate limiting.
- Charts via the existing recharts setup; map/geolocation only where already granted.
