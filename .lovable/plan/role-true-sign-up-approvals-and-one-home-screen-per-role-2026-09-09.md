# Role-true sign-up, approvals, and one home screen per role

## What is wrong today (checked in the code)

- The sign-up form offers "Authority administrator" and "Supervisor" as self-service choices.
- New accounts always end up as **citizen**: the account setup step only assigns a role when the account has none, and the database already inserted `citizen`, so the role a person picked never takes effect and no approval is recorded for it.
- Every signed-in person lands on the same `/dashboard` screen with the same panels (inspections, complaints, demo button), so an inspector, a company and a citizen all see near-identical content.
- The complaint queue cards are plain stacked boxes with little grouping or filtering.

## What will change

### 1. Sign-up offers only three roles
Choices become: **Citizen**, **Inspector**, **Company / packer**. Authority administrator and supervisor cannot be created from the form — they sign in only.

### 2. Ready-made authority administrator (and other demo) logins
Pre-created, clearly-marked demo accounts with confirmed emails and known passwords:

| Role | Email | Password |
| --- | --- | --- |
| Authority administrator | admin.demo@scanova.ai | Scanova#2026 |
| Supervisor | supervisor.demo@scanova.ai | Scanova#2026 |
| Inspector | inspector.demo@scanova.ai | Scanova#2026 |
| Company / packer | company.demo@scanova.ai | Scanova#2026 |
| Citizen | citizen.demo@scanova.ai | Scanova#2026 |

A collapsible "Demo logins" panel on the sign-in tab lists them and fills the form in one click.

### 3. Real approval chain
- Sign-up with **Inspector** creates a citizen account plus a pending request that appears in the authority administrator's approval queue.
- Sign-up with **Company / packer** creates a pending request that appears in a new approval queue on the **inspector** screen (and also to authority administrators, so nothing stalls if no inspector is active).
- Approving grants the role, attaches inspectors to the authority office, creates the company record for a packer, and notifies the applicant. Declining records the reason.
- Until approval, the applicant sees a clear "waiting for approval" card with the request date, and only citizen features.

### 4. A different home screen per role
`/dashboard` becomes a router that sends each person to their own screen; each screen keeps its own actions only:

- **Citizen** — report a package, my complaints with map and progress trail, scan a package, track by code. No inspection statistics.
- **Inspector** — my workload, complaint queue, new inspection, drafts awaiting finalisation, company approval requests.
- **Supervisor** — inspections awaiting review, decisions made, authority trends. No demo-seed button.
- **Company / packer** — my products, batches, barcodes, inspections that involve my products, compliance issues raised against me.
- **Authority administrator** — authority-wide analytics, staff access requests, complaint assignment, offices and roster.

Sidebar links are filtered per role (already partly done) and extended so each role sees only its own destinations.

### 5. Dates and figures come from records
Every date shown is rendered from the stored timestamp in the reader's local time with a relative hint ("2 hours ago"); no placeholder or hard-coded dates anywhere on the new screens. Counts come from live queries.

### 6. Better complaint queue
Reworked queue: sticky filter bar (status, priority, mine/unclaimed, newest/oldest), compact rows that expand for photo, map and progress trail, priority and age chips, empty and loading states, and a single clear action per row.

## Technical notes

- Migration: seed demo accounts and their roles/memberships/company records with literal inserts (confirmed emails); add an `authority_admin`-owned unique demo authority link where missing.
- Replace the "assign requested role if no role" branch in `bootstrapWorkspace` with request creation only; role grants happen exclusively through the approval server functions (`grant_role`), keeping privilege escalation impossible from the client.
- New server function `listPackerRequests` / reuse `decideRoleRequest` with an authorisation check allowing `inspector` for `manufacturer` requests and `authority_admin`/`system_admin` for all.
- New routes: `src/routes/_authenticated/citizen.tsx`, `supervisor.tsx`, plus `dashboard.tsx` reduced to a role-based redirect; existing `inspector.tsx`, `government.tsx`, `products.tsx` extended with their dedicated panels and the new approval queue.
- Shared date helper in `src/lib/domain.ts` for absolute + relative formatting.
- Complaint queue rework stays in `src/components/complaint-queue.tsx` (+ small shared filter component); the complaint server functions are unchanged.
