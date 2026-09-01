# Two dedicated dashboards: Inspector and Government

Today there is one shared `/dashboard` plus an `/authority` page. The backend already computes real inspector and authority analytics from live inspection rows, but no screen uses them. This adds two purpose-built dashboards driven by that real data.

## Inspector dashboard (`/inspector`)
For the person doing field inspections — their own work only.

- Today's inspections, in progress, finalized, non-compliant, needs review, awaiting supervisor, pending sync.
- 30-day trend chart of inspections by outcome (compliant / non-compliant / review).
- Breakdown by product category.
- Recent inspections list linking straight into each record.
- Offline sync queue panel: pending / processing / failed items with the last error, so the inspector knows nothing is silently stuck.
- Quick actions: New inspection, All inspections.

## Government dashboard (`/government`)
For authority admins and supervisors — everything inside their authority, with row-level security keeping other authorities out.

- Headline figures: total inspections, compliance rate, non-compliant, needs review, open complaints, pending review requests.
- Trend chart over the selected window.
- Most-failed rules (rule number + title) so enforcement priorities are visible.
- Inspector leaderboard: volume and outcomes per inspector.
- Category and region breakdowns; map/geo points where coordinates exist.
- Complaint status mix and pending role requests.
- Filters: date range, category, result, office, region, inspector — passed to the existing filtered analytics endpoint.
- Empty states stay honest: no data means empty charts, never invented numbers.

## Navigation and access
- Sidebar gains "My dashboard" (inspector, supervisor, authority admin, system admin) and "Government" (supervisor, authority admin, system admin).
- `/dashboard` stays as the shared landing page and routes each role to its dashboard.
- Both routes live under the authenticated area; a user without the right role sees a short "not available for your role" panel rather than an error.

## Technical notes
- Data comes from existing server functions in `src/lib/analytics.functions.ts`: `inspectorDashboard`, `authorityDashboard` (supervisors use the same authority view, scoped by RLS), and `analyticsFilterOptions` for filter dropdowns. No new endpoints or migrations needed.
- New route files `src/routes/_authenticated/inspector.tsx` and `src/routes/_authenticated/government.tsx`, each with its own `head()` metadata.
- Charts use the recharts setup already used in `authority.tsx`; cards, badges and skeletons reuse existing UI components and semantic color tokens.
- Reads use TanStack Query with `useServerFn`; loading uses skeletons and errors render an inline message.
