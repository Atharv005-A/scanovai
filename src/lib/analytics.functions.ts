/**
 * Dashboard analytics.
 *
 * Every number here is computed from rows the caller is allowed to read:
 * queries run through the request-scoped client, so authority isolation is
 * enforced by row-level security rather than by application filters. Nothing is
 * fabricated — an empty database produces empty charts.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Sb = {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, any>) => Promise<{ data: any; error: any }>;
};

const filterSchema = z
  .object({
    from: z.string().max(30).nullable().optional(),
    to: z.string().max(30).nullable().optional(),
    category: z.string().max(40).nullable().optional(),
    result: z.string().max(40).nullable().optional(),
    inspectorId: z.string().uuid().nullable().optional(),
    officeId: z.string().uuid().nullable().optional(),
    manufacturer: z.string().max(160).nullable().optional(),
    region: z.string().max(120).nullable().optional(),
  })
  .default({});

export type AnalyticsFilters = z.infer<typeof filterSchema>;

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

function tally<T>(rows: T[], key: (row: T) => string | null) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const k = key(row);
    if (!k) continue;
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

function windowFrom(filters: AnalyticsFilters) {
  const to = filters.to ? new Date(filters.to) : new Date();
  const from = filters.from ? new Date(filters.from) : new Date(to.getTime() - 29 * 86_400_000);
  return { fromIso: new Date(from.setHours(0, 0, 0, 0)).toISOString(), toIso: new Date(to.setHours(23, 59, 59, 999)).toISOString() };
}

interface InspectionRow {
  id: string;
  reference_code: string;
  inspector_id: string;
  authority_id: string | null;
  office_id: string | null;
  category: string;
  product_name: string | null;
  manufacturer_name: string | null;
  status: string;
  result: string;
  assessment_score: number | null;
  sync_status: string;
  ocr_status: string;
  registry_match: string;
  review_requested: boolean;
  supervisor_decision: string | null;
  conflict_flag: boolean;
  latitude: number | null;
  longitude: number | null;
  region: string | null;
  location_label: string | null;
  created_at: string;
  finalized_at: string | null;
}

const INSPECTION_COLUMNS =
  "id, reference_code, inspector_id, authority_id, office_id, category, product_name, manufacturer_name, status, result, assessment_score, sync_status, ocr_status, registry_match, review_requested, supervisor_decision, conflict_flag, latitude, longitude, region, location_label, created_at, finalized_at";

async function loadInspections(supabase: Sb, filters: AnalyticsFilters, limit = 4000) {
  const { fromIso, toIso } = windowFrom(filters);
  let query = supabase
    .from("inspections")
    .select(INSPECTION_COLUMNS)
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.result) query = query.eq("result", filters.result);
  if (filters.inspectorId) query = query.eq("inspector_id", filters.inspectorId);
  if (filters.officeId) query = query.eq("office_id", filters.officeId);
  if (filters.region) query = query.eq("region", filters.region);
  if (filters.manufacturer) query = query.ilike("manufacturer_name", `%${filters.manufacturer}%`);
  const { data, error } = await query;
  if (error) throw new Error("The inspection figures could not be read.");
  return { rows: (data ?? []) as InspectionRow[], fromIso, toIso };
}

function trendSeries(rows: InspectionRow[], fromIso: string, toIso: string) {
  const start = new Date(fromIso);
  const end = new Date(toIso);
  const days: { date: string; total: number; compliant: number; non_compliant: number; review: number }[] = [];
  const buckets = new Map<string, { total: number; compliant: number; non_compliant: number; review: number }>();
  for (const row of rows) {
    const key = dayKey(row.created_at);
    const entry = buckets.get(key) ?? { total: 0, compliant: 0, non_compliant: 0, review: 0 };
    entry.total += 1;
    if (row.result === "compliant") entry.compliant += 1;
    else if (row.result === "non_compliant") entry.non_compliant += 1;
    else if (row.result === "needs_review" || row.result === "unable_to_verify") entry.review += 1;
    buckets.set(key, entry);
  }
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86_400_000)) {
    const key = d.toISOString().slice(0, 10);
    const entry = buckets.get(key) ?? { total: 0, compliant: 0, non_compliant: 0, review: 0 };
    days.push({ date: key, ...entry });
  }
  return days;
}

async function ruleFailures(supabase: Sb, inspectionIds: string[]) {
  if (inspectionIds.length === 0) return { distribution: [], recurring: [] };
  const ids = inspectionIds.slice(0, 400);
  const { data } = await supabase
    .from("compliance_checks")
    .select("rule_number, title, result, inspection_id")
    .in("inspection_id", ids)
    .in("result", ["fail", "needs_review"])
    .limit(6000);
  const rows = (data ?? []) as { rule_number: string; title: string; result: string }[];
  const distribution = tally(rows, (r) => `${r.rule_number} · ${r.title}`).slice(0, 12);
  const failures = rows.filter((r) => r.result === "fail");
  const recurring = tally(failures, (r) => `${r.rule_number} · ${r.title}`).slice(0, 8);
  return { distribution, recurring };
}

/** Inspector's own working view. */
export const inspectorDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const since = new Date(Date.now() - 29 * 86_400_000).toISOString();
    const { data } = await supabase
      .from("inspections")
      .select(INSPECTION_COLUMNS)
      .eq("inspector_id", userId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);
    const rows = (data ?? []) as InspectionRow[];
    const today = new Date().toISOString().slice(0, 10);

    const { data: pendingSync } = await supabase
      .from("sync_queue")
      .select("id, status, operation, attempts, last_error, created_at")
      .eq("user_id", userId)
      .in("status", ["pending", "processing", "failed"])
      .order("created_at", { ascending: false })
      .limit(50);

    return {
      counts: {
        today: rows.filter((r) => dayKey(r.created_at) === today).length,
        finalized: rows.filter((r) => r.status === "finalized").length,
        inProgress: rows.filter((r) => !["finalized", "cancelled"].includes(r.status)).length,
        nonCompliant: rows.filter((r) => r.result === "non_compliant").length,
        review: rows.filter((r) => r.result === "needs_review" || r.result === "unable_to_verify").length,
        pendingSync: rows.filter((r) => r.sync_status !== "synced").length,
        awaitingSupervisor: rows.filter((r) => r.review_requested && r.supervisor_decision === "pending")
          .length,
      },
      trend: trendSeries(rows, new Date(Date.now() - 29 * 86_400_000).toISOString(), new Date().toISOString()),
      categories: tally(rows, (r) => r.category).slice(0, 8),
      recent: rows.slice(0, 8),
      queue: (pendingSync ?? []) as Record<string, any>[],
    };
  });

/** Supervisor's team view, scoped to the supervisor's authority by RLS. */
export const supervisorDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => filterSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context as unknown as { supabase: Sb };
    const { rows, fromIso, toIso } = await loadInspections(supabase, data, 2000);

    const pendingReview = rows.filter((r) => r.review_requested && r.supervisor_decision === "pending");
    const inspectorIds = [...new Set(rows.map((r) => r.inspector_id))];
    const { data: profiles } = inspectorIds.length
      ? await supabase.from("profiles").select("id, full_name, email").in("id", inspectorIds.slice(0, 200))
      : { data: [] };
    const nameById = new Map(
      ((profiles ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name]),
    );

    const { distribution } = await ruleFailures(
      supabase,
      rows.map((r) => r.id),
    );

    return {
      counts: {
        total: rows.length,
        pendingReview: pendingReview.length,
        nonCompliant: rows.filter((r) => r.result === "non_compliant").length,
        review: rows.filter((r) => r.result === "needs_review").length,
        finalized: rows.filter((r) => r.status === "finalized").length,
        conflicts: rows.filter((r) => r.conflict_flag).length,
      },
      trend: trendSeries(rows, fromIso, toIso),
      ruleFailures: distribution,
      inspectors: tally(rows, (r) => nameById.get(r.inspector_id) ?? "Unnamed officer").slice(0, 10),
      queue: pendingReview.slice(0, 20),
      recent: rows.slice(0, 10),
    };
  });

/** Authority-wide analytics with real filters. */
export const authorityDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => filterSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context as unknown as { supabase: Sb };
    const { rows, fromIso, toIso } = await loadInspections(supabase, data);

    const [{ distribution, recurring }, complaints, scans, retail] = await Promise.all([
      ruleFailures(
        supabase,
        rows.map((r) => r.id),
      ),
      supabase
        .from("complaints")
        .select("id, status, priority, created_at, region, product_name, latitude, longitude")
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase
        .from("package_scans")
        .select("id, source, registry_match, created_at, region, barcode, product_id, latitude, longitude")
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .order("created_at", { ascending: false })
        .limit(2000),
      supabase
        .from("retail_scans")
        .select("id, alert, held_for_review, created_at, barcode")
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .limit(2000),
    ]);

    const complaintRows = (complaints.data ?? []) as {
      status: string;
      priority: string;
      created_at: string;
      region: string | null;
      latitude: number | null;
      longitude: number | null;
      product_name: string;
    }[];
    const scanRows = (scans.data ?? []) as {
      source: string;
      registry_match: string;
      region: string | null;
      barcode: string | null;
      latitude: number | null;
      longitude: number | null;
    }[];
    const retailRows = (retail.data ?? []) as { alert: string; held_for_review: boolean }[];

    const mismatchScans = scanRows.filter((s) => s.registry_match === "mismatch" || s.registry_match === "review");

    return {
      window: { from: fromIso, to: toIso },
      counts: {
        total: rows.length,
        compliant: rows.filter((r) => r.result === "compliant").length,
        nonCompliant: rows.filter((r) => r.result === "non_compliant").length,
        review: rows.filter((r) => r.result === "needs_review").length,
        unableToVerify: rows.filter((r) => r.result === "unable_to_verify").length,
        pending: rows.filter((r) => r.result === "pending").length,
        finalized: rows.filter((r) => r.status === "finalized").length,
        conflicts: rows.filter((r) => r.conflict_flag).length,
        complaints: complaintRows.length,
        openComplaints: complaintRows.filter((c) => !["resolved", "closed", "rejected"].includes(c.status))
          .length,
        publicScans: scanRows.filter((s) => s.source === "public").length,
        retailScans: retailRows.length,
        heldItems: retailRows.filter((r) => r.held_for_review).length,
      },
      trend: trendSeries(rows, fromIso, toIso),
      resultDistribution: tally(rows, (r) => r.result),
      ruleFailures: distribution,
      recurringViolations: recurring,
      categories: tally(rows, (r) => r.category),
      manufacturers: tally(rows, (r) => r.manufacturer_name).slice(0, 10),
      regions: tally(rows, (r) => r.region ?? r.location_label),
      registryMatches: tally(rows, (r) => r.registry_match),
      ocrHealth: tally(rows, (r) => r.ocr_status),
      syncHealth: tally(rows, (r) => r.sync_status),
      complaintsByStatus: tally(complaintRows, (c) => c.status),
      complaintsByPriority: tally(complaintRows, (c) => c.priority),
      retailAlerts: tally(retailRows, (r) => r.alert),
      mismatchHotspots: tally(mismatchScans, (s) => s.region ?? "Unrecorded area").slice(0, 10),
      map: {
        inspections: rows
          .filter((r) => r.latitude != null && r.longitude != null)
          .slice(0, 500)
          .map((r) => ({
            id: r.id,
            code: r.reference_code,
            lat: Number(r.latitude),
            lng: Number(r.longitude),
            result: r.result,
            label: r.product_name ?? r.reference_code,
          })),
        complaints: complaintRows
          .filter((c) => c.latitude != null && c.longitude != null)
          .slice(0, 300)
          .map((c) => ({
            lat: Number(c.latitude),
            lng: Number(c.longitude),
            status: c.status,
            label: c.product_name,
          })),
        mismatches: mismatchScans
          .filter((s) => s.latitude != null && s.longitude != null)
          .slice(0, 300)
          .map((s) => ({
            lat: Number(s.latitude),
            lng: Number(s.longitude),
            label: s.barcode ?? "Package scan",
            match: s.registry_match,
          })),
      },
      recent: rows.slice(0, 12),
    };
  });

/** Platform health for system administrators. */
export const systemDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const roles = ((roleRows ?? []) as { role: string }[]).map((r) => r.role);
    if (!roles.includes("system_admin")) throw new Error("System administrator role required.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 29 * 86_400_000).toISOString();

    const [authorities, users, inspections, ocr, extractions, sync, audits, products, complaints] =
      await Promise.all([
        supabaseAdmin.from("authorities").select("id, name, code, state, is_demo"),
        supabaseAdmin.from("user_roles").select("role"),
        supabaseAdmin
          .from("inspections")
          .select("id, status, result, ocr_status, sync_status, created_at")
          .gte("created_at", since)
          .limit(5000),
        supabaseAdmin.from("ocr_results").select("status, provider, duration_ms, created_at").gte("created_at", since).limit(5000),
        supabaseAdmin.from("extractions").select("status, model, duration_ms, created_at").gte("created_at", since).limit(5000),
        supabaseAdmin.from("sync_queue").select("status, attempts, last_error, created_at").gte("created_at", since).limit(2000),
        supabaseAdmin
          .from("audit_logs")
          .select("id, action, entity, created_at, actor_id")
          .order("created_at", { ascending: false })
          .limit(40),
        supabaseAdmin.from("products").select("status"),
        supabaseAdmin.from("complaints").select("status, source"),
      ]);

    const ocrRows = (ocr.data ?? []) as { status: string; duration_ms: number | null; provider: string }[];
    const durations = ocrRows.map((r) => r.duration_ms ?? 0).filter((n) => n > 0);

    return {
      authorities: (authorities.data ?? []) as Record<string, any>[],
      roleCounts: tally((users.data ?? []) as { role: string }[], (r) => r.role),
      inspectionCounts: {
        total: (inspections.data ?? []).length,
        finalized: ((inspections.data ?? []) as { status: string }[]).filter((r) => r.status === "finalized")
          .length,
      },
      inspectionResults: tally((inspections.data ?? []) as { result: string }[], (r) => r.result),
      ocr: {
        byStatus: tally(ocrRows, (r) => r.status),
        byProvider: tally(ocrRows, (r) => r.provider),
        medianMs: durations.length
          ? durations.sort((a, b) => a - b)[Math.floor(durations.length / 2)]!
          : null,
      },
      extractions: tally((extractions.data ?? []) as { status: string }[], (r) => r.status),
      sync: {
        byStatus: tally((sync.data ?? []) as { status: string }[], (r) => r.status),
        failures: ((sync.data ?? []) as { status: string }[]).filter((r) => r.status === "failed").length,
      },
      products: tally((products.data ?? []) as { status: string }[], (r) => r.status),
      complaints: tally((complaints.data ?? []) as { status: string }[], (r) => r.status),
      auditEvents: (audits.data ?? []) as Record<string, any>[],
    };
  });

/** Values for the dashboard filter controls, from data the caller can read. */
export const analyticsFilterOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as unknown as { supabase: Sb };
    const [offices, inspections, members] = await Promise.all([
      supabase.from("offices").select("id, name, district, state").order("name").limit(200),
      supabase
        .from("inspections")
        .select("category, manufacturer_name, region, inspector_id")
        .order("created_at", { ascending: false })
        .limit(1500),
      supabase.from("authority_members").select("user_id, member_role").eq("is_active", true).limit(300),
    ]);

    const rows = (inspections.data ?? []) as {
      category: string;
      manufacturer_name: string | null;
      region: string | null;
      inspector_id: string;
    }[];
    const memberIds = ((members.data ?? []) as { user_id: string }[]).map((m) => m.user_id);
    const { data: profiles } = memberIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", memberIds)
      : { data: [] };

    return {
      offices: (offices.data ?? []) as Record<string, any>[],
      categories: [...new Set(rows.map((r) => r.category))].sort(),
      manufacturers: [...new Set(rows.map((r) => r.manufacturer_name).filter(Boolean))].slice(0, 60) as string[],
      regions: [...new Set(rows.map((r) => r.region).filter(Boolean))].slice(0, 60) as string[],
      inspectors: ((profiles ?? []) as { id: string; full_name: string }[]).map((p) => ({
        id: p.id,
        name: p.full_name,
      })),
    };
  });
