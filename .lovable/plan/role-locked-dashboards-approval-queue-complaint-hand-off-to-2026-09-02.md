# Role-locked dashboards, approval queue, complaint hand-off to inspectors, tamper check

Seven connected changes so each role sees only its own screens and a complaint travels end to end: citizen files it → authority sees it → inspector accepts it → inspection is created from it → citizen tracks it.

## 1. Dashboards locked to the right role

Currently both new dashboards open to any government role (inspector dashboard is gated on "any gov staff", and the sidebar shows the government dashboard to supervisors too).

- `/inspector` — visible and usable only with the **inspector** role.
- `/government` — visible and usable only with **authority admin** or **system admin** (supervisors keep their own review screens and the Authority page).
- Anyone else sees a short "not available for your role" panel; sidebar links follow the same rule so nobody sees a link they cannot use.
- `/dashboard` sends each account straight to its own dashboard.

## 2. Access requests reach an approval screen

The backend already records access requests (inspector, supervisor, manufacturer, retailer, authority admin) with approve/reject functions, but there is no screen for either side, and approval notifications link to a page that does not exist.

- Sign-up already collects the requested role and justification; after sign-in a pending applicant sees a clear "awaiting approval" card with what they asked for and when, plus the option to withdraw/resubmit with a better justification.
- New **Access requests** panel on the Government dashboard and the Authority page: applicant name, email, role asked for, justification, date; Approve or Decline with a reason. Approving grants the role and attaches the person to the authority; both outcomes notify the applicant.
- Fix the notification deep link so it opens that panel.

## 3. Complaint location: map preview, not just numbers

- Complaint forms (guest `/report` and signed-in) capture coordinates as today, then show a **map preview** with a pin and a plain-language place line, plus a "location not shared" state that never blocks submission.
- Every complaint detail view (authority, inspector, and the citizen tracking page) shows the same map preview and a link to open it in a full map.
- Map uses OpenStreetMap embedded tiles — no API key, no new account.

## 4. Complaints appear on the inspector dashboard and can be accepted

- New **Complaints assigned / open near you** section on `/inspector`: unassigned complaints in the inspector's authority plus complaints already assigned to them, with product, description, evidence photo, map preview and age.
- **Accept** claims the complaint (assigns it to that inspector, moves status to `assigned`, records who and when).
- **Start inspection** creates a new inspection pre-filled from the complaint (product name, manufacturer, barcode, category, location) and links the two records, so the inspection report carries the complaint code.
- Authority staff keep the ability to assign a complaint to a specific inspector from the Government dashboard / complaints screen.

## 5. Whole complaint journey is tracked

- Every step writes a visible progress entry: submitted → under review → assigned to inspector → inspection in progress → inspection finalized (with outcome) → resolved / rejected / closed.
- Public entries are what the citizen sees on `/track` (a timeline with dates), internal notes stay staff-only.
- When the linked inspection is finalized, the complaint automatically gets an entry naming the outcome (compliant / non-compliant / needs review) and links to the report.
- Complaint status changes and assignments are audit-logged.

## 6. Better graphs

- Trend charts get stacked areas with a readable legend, a switch between 7 / 30 / 90 days, and value labels on hover with real counts.
- Most-failed rules chart shows rule number + short title with fail counts and share of inspections.
- Outcome mix becomes a donut with a centre total; category and region charts get sorted bars with counts.
- Complaint funnel chart (submitted → assigned → inspected → resolved) with average time at each step.
- Every chart keeps an honest empty state and a small "based on N records" caption.

## 7. Label tamper check

A new advisory check inside the inspection pipeline that looks for signs a label was altered — sticker/overlay over the printed MRP or net quantity, mismatched fonts or backgrounds around a declaration, over-written or scratched values, duplicate MRP prints with different numbers, and mismatch against the registered product/batch values where the product is registered.

- Result is shown as **No signs of tampering / Possible tampering — manual verification required**, with the reason and the image region it came from.
- It never produces a legal verdict on its own: a suspected tamper marks the inspection "needs review" and appears in the report and on the supervisor screen as an advisory finding, in line with the rest of the system.
- Sticker-over-MRP suspicion is also raised when the printed MRP contradicts the registry MRP for a scanned barcode.

## Technical notes

- Gating: `roles.includes("inspector")` for `/inspector`; `authority_admin`/`system_admin` for `/government`; same predicates in the `NAV` list in `src/routes/_authenticated/route.tsx`; `/dashboard` redirects by primary role.
- Access requests: reuse `listRoleRequests` / `decideRoleRequest` / `requestRole` in `src/lib/admin.functions.ts`; new UI panel component shared by `government.tsx` and `authority.tsx`; add a pending-request card to `dashboard.tsx`. Notification link changed from `/admin` to `/government`.
- Complaints: add server functions for authority/inspector complaint queues, `acceptComplaint`, `assignComplaint`, and `startInspectionFromComplaint` (creates the inspection and stores the link). Requires a small additive migration: `complaints.inspection_id` (nullable) plus an inspector-scoped SELECT/UPDATE policy for complaints in the inspector's authority, and grants. Progress entries go into the existing `complaint_updates` table (`is_public` flag), audit entries into `audit_logs`.
- Finalize hook: `finalizeInspection` in `src/lib/inspection.functions.ts` writes a public `complaint_updates` row when the inspection is linked to a complaint.
- Map preview: small `<LocationMap>` component using an OpenStreetMap `embed.html` iframe with a marker plus an "open larger map" link; no new dependency, no client secret.
- Charts: keep recharts; extract shared chart wrappers/tooltips into `src/components/charts.tsx` so both dashboards share styling and semantic color tokens.
- Tamper check: new `tamperAssessment` step in `src/lib/pipeline.server.ts` using the existing Lovable AI vision path plus OCR-block heuristics and registry comparison, persisted alongside compliance checks as an advisory `needs_review` finding (`manual_verification_required` where evidence is weak); surfaced in `inspections.$id.tsx` and the PDF report.
