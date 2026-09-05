import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { MapPin, RefreshCw } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import { authorityDashboard, analyticsFilterOptions } from "@/lib/analytics.functions";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OverallBadge } from "@/components/status";
import { CATEGORY_LABELS, OVERALL_LABELS } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/government")({
  head: () => ({
    meta: [
      { title: "Government dashboard — SCANOVA-AI" },
      {
        name: "description",
        content:
          "Authority-wide compliance oversight: enforcement trends, most-failed rules, inspector performance, complaints and hotspots.",
      },
      { property: "og:title", content: "Government dashboard — SCANOVA-AI" },
      {
        property: "og:description",
        content: "Authority-wide Legal Metrology compliance analytics from live inspection records.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GovernmentDashboard,
});

const COLORS = ["#1f9d55", "#c0392b", "#d68910", "#2471a3", "#7f8c8d", "#8e44ad"];
const ALL = "__all__";

interface Filters {
  from: string;
  to: string;
  category: string;
  result: string;
  officeId: string;
  region: string;
  inspectorId: string;
}

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

function GovernmentDashboard() {
  const { roles } = useAuth();
  const allowed = roles.some((r) => ["authority_admin", "system_admin"].includes(r));


  const [filters, setFilters] = useState<Filters>({
    from: isoDaysAgo(29),
    to: new Date().toISOString().slice(0, 10),
    category: ALL,
    result: ALL,
    officeId: ALL,
    region: ALL,
    inspectorId: ALL,
  });

  const loadDashboard = useServerFn(authorityDashboard);
  const loadOptions = useServerFn(analyticsFilterOptions);

  const payload = useMemo(
    () => ({
      from: filters.from || null,
      to: filters.to || null,
      category: filters.category === ALL ? null : filters.category,
      result: filters.result === ALL ? null : filters.result,
      officeId: filters.officeId === ALL ? null : filters.officeId,
      region: filters.region === ALL ? null : filters.region,
      inspectorId: filters.inspectorId === ALL ? null : filters.inspectorId,
    }),
    [filters],
  );

  const options = useQuery({
    queryKey: ["dashboard", "filter-options"],
    queryFn: () => loadOptions(),
    enabled: allowed,
  });

  const q = useQuery({
    queryKey: ["dashboard", "government", payload],
    queryFn: () => loadDashboard({ data: payload }),
    enabled: allowed,
  });

  if (roles.length > 0 && !allowed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Not available for your role</CardTitle>
          <CardDescription>
            The government dashboard is for supervisors and authority administrators.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const d = q.data;
  const c = d?.counts;
  const complianceRate = c && c.total > 0 ? Math.round((c.compliant / c.total) * 100) : null;
  const geo = [
    ...(d?.map.inspections ?? []).map((p) => ({ ...p, kind: "Inspection" })),
    ...(d?.map.complaints ?? []).map((p) => ({ ...p, kind: "Complaint" })),
    ...(d?.map.mismatches ?? []).map((p) => ({ ...p, kind: "Registry mismatch" })),
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Government dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything inside your authority. Other authorities' records are never included.
          </p>
        </div>
        <Button variant="ghost" onClick={() => q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={`mr-2 size-4 ${q.isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
          <CardDescription>Narrow the window, category, outcome, office, region or officer.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="from">From</Label>
            <Input
              id="from"
              type="date"
              value={filters.from}
              onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="to">To</Label>
            <Input
              id="to"
              type="date"
              value={filters.to}
              onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
            />
          </div>
          <Picker
            label="Category"
            value={filters.category}
            onChange={(v) => setFilters((f) => ({ ...f, category: v }))}
            items={(options.data?.categories ?? []).map((cat) => ({
              value: cat,
              label: CATEGORY_LABELS[cat] ?? cat,
            }))}
          />
          <Picker
            label="Outcome"
            value={filters.result}
            onChange={(v) => setFilters((f) => ({ ...f, result: v }))}
            items={Object.entries(OVERALL_LABELS).map(([value, label]) => ({ value, label }))}
          />
          <Picker
            label="Office"
            value={filters.officeId}
            onChange={(v) => setFilters((f) => ({ ...f, officeId: v }))}
            items={(options.data?.offices ?? []).map((o) => ({
              value: String(o['id']),
              label: String(o['name']),
            }))}
          />
          <Picker
            label="Region"
            value={filters.region}
            onChange={(v) => setFilters((f) => ({ ...f, region: v }))}
            items={(options.data?.regions ?? []).map((r) => ({ value: r, label: r }))}
          />
          <Picker
            label="Inspector"
            value={filters.inspectorId}
            onChange={(v) => setFilters((f) => ({ ...f, inspectorId: v }))}
            items={(options.data?.inspectors ?? []).map((i) => ({
              value: i.id,
              label: i.name || "Unnamed officer",
            }))}
          />
          <div className="flex items-end">
            <Button
              variant="outline"
              className="w-full"
              onClick={() =>
                setFilters({
                  from: isoDaysAgo(29),
                  to: new Date().toISOString().slice(0, 10),
                  category: ALL,
                  result: ALL,
                  officeId: ALL,
                  region: ALL,
                  inspectorId: ALL,
                })
              }
            >
              Reset filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {q.error ? (
        <p className="text-sm text-destructive">
          These figures could not be loaded. Please adjust the filters or refresh.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Inspections" value={c?.total} loading={q.isLoading} />
        <Stat
          label="Compliance rate"
          value={complianceRate}
          suffix="%"
          tone="success"
          loading={q.isLoading}
        />
        <Stat label="Non-compliant" value={c?.nonCompliant} tone="destructive" loading={q.isLoading} />
        <Stat label="Needs review" value={c?.review} tone="warning" loading={q.isLoading} />
        <Stat label="Finalized" value={c?.finalized} loading={q.isLoading} />
        <Stat label="Open complaints" value={c?.openComplaints} tone="warning" loading={q.isLoading} />
        <Stat label="Public scans" value={c?.publicScans} loading={q.isLoading} />
        <Stat label="Retail holds" value={c?.heldItems} tone="destructive" loading={q.isLoading} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Enforcement trend</CardTitle>
            <CardDescription>Inspections per day in the selected window.</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {q.isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (d?.trend ?? []).length === 0 ? (
              <Empty>No inspections in this window.</Empty>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={d?.trend ?? []}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="total" name="Total" stroke="#2471a3" strokeWidth={2} dot={false} />
                  <Line
                    type="monotone"
                    dataKey="compliant"
                    name="Compliant"
                    stroke="#1f9d55"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="non_compliant"
                    name="Non-compliant"
                    stroke="#c0392b"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Outcome mix</CardTitle>
            <CardDescription>How inspections concluded.</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {q.isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (d?.resultDistribution ?? []).length === 0 ? (
              <Empty>No outcomes to show.</Empty>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={(d?.resultDistribution ?? []).map((r) => ({
                      name: OVERALL_LABELS[r.label] ?? r.label,
                      value: r.count,
                    }))}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={90}
                    label
                  >
                    {(d?.resultDistribution ?? []).map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Most-failed rules</CardTitle>
            <CardDescription>Where enforcement attention is needed, by rule number.</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            {q.isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (d?.ruleFailures ?? []).length === 0 ? (
              <Empty>No rule failures recorded in this window.</Empty>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d?.ruleFailures ?? []} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={150}
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v: string) => (v.length > 26 ? `${v.slice(0, 26)}…` : v)}
                  />
                  <Tooltip />
                  <Bar dataKey="count" name="Findings" fill="#c0392b" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Categories</CardTitle>
            <CardDescription>Commodity groups inspected.</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            {q.isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (d?.categories ?? []).length === 0 ? (
              <Empty>No categories to show.</Empty>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={(d?.categories ?? []).slice(0, 10).map((x) => ({
                    name: CATEGORY_LABELS[x.label] ?? x.label,
                    count: x.count,
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-15} height={54} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Inspections" fill="#2471a3" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <ListCard
          title="Top manufacturers"
          description="By inspection volume in this window."
          loading={q.isLoading}
          rows={(d?.manufacturers ?? []).map((m) => ({ label: m.label, count: m.count }))}
          empty="No manufacturer names recorded."
        />
        <ListCard
          title="Regions"
          description="Where inspections took place."
          loading={q.isLoading}
          rows={(d?.regions ?? []).slice(0, 10).map((r) => ({ label: r.label, count: r.count }))}
          empty="No regions recorded."
        />
        <ListCard
          title="Complaints by status"
          description="Citizen reports visible to your authority."
          loading={q.isLoading}
          rows={(d?.complaintsByStatus ?? []).map((r) => ({
            label: r.label.replace(/_/g, " "),
            count: r.count,
          }))}
          empty="No complaints in this window."
        />
        <ListCard
          title="Registry checks"
          description="How scanned packages matched the product registry."
          loading={q.isLoading}
          rows={(d?.registryMatches ?? []).map((r) => ({
            label: r.label.replace(/_/g, " "),
            count: r.count,
          }))}
          empty="No registry comparisons recorded."
        />
        <ListCard
          title="Mismatch hotspots"
          description="Areas with registry mismatches or reviews."
          loading={q.isLoading}
          rows={(d?.mismatchHotspots ?? []).map((r) => ({ label: r.label, count: r.count }))}
          empty="No mismatches recorded."
        />
        <ListCard
          title="Retail alerts"
          description="Billing-counter checks raised by retailers."
          loading={q.isLoading}
          rows={(d?.retailAlerts ?? []).map((r) => ({
            label: r.label.replace(/_/g, " "),
            count: r.count,
          }))}
          empty="No retail scans in this window."
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Geographic spread</CardTitle>
          <CardDescription>
            Recorded coordinates for inspections, complaints and registry mismatches.
          </CardDescription>
        </CardHeader>
        <CardContent className="h-80">
          {q.isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : geo.length === 0 ? (
            <Empty>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4" /> No location data was captured for these records.
              </span>
            </Empty>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" dataKey="lng" name="Longitude" tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
                <YAxis type="number" dataKey="lat" name="Latitude" tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
                <ZAxis type="category" dataKey="label" name="Record" />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                <Scatter name="Records" data={geo} fill="#2471a3" />
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent inspections</CardTitle>
          <CardDescription>Latest records matching the filters.</CardDescription>
        </CardHeader>
        <CardContent>
          {q.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (d?.recent ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No inspections match these filters.</p>
          ) : (
            <ul className="divide-y divide-border">
              {(d?.recent ?? []).map((r) => (
                <li key={r.id}>
                  <Link
                    to="/inspections/$id"
                    params={{ id: r.id }}
                    className="flex flex-wrap items-center gap-3 py-3 hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.product_name || "Untitled package"}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.reference_code} · {CATEGORY_LABELS[r.category] ?? r.category} ·{" "}
                        {new Date(r.created_at).toLocaleString()}
                      </p>
                    </div>
                    {r.conflict_flag ? <Badge variant="destructive">conflict</Badge> : null}
                    <Badge variant="secondary" className="capitalize">
                      {r.status}
                    </Badge>
                    <OverallBadge result={r.result} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Picker({
  label,
  value,
  onChange,
  items,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  items: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={`All ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All</SelectItem>
          {items.map((i) => (
            <SelectItem key={i.value} value={i.value}>
              {i.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ListCard({
  title,
  description,
  rows,
  loading,
  empty,
}: {
  title: string;
  description: string;
  rows: { label: string; count: number }[];
  loading?: boolean;
  empty: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.label} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm capitalize">{r.label}</span>
                <Badge variant="secondary">{r.count}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center rounded-md border border-dashed border-border">
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

function Stat({
  label,
  value,
  suffix,
  tone,
  loading,
}: {
  label: string;
  value: number | null | undefined;
  suffix?: string;
  tone?: "success" | "destructive" | "warning";
  loading?: boolean;
}) {
  const toneCls =
    tone === "success"
      ? "text-success"
      : tone === "destructive"
        ? "text-destructive"
        : tone === "warning"
          ? "text-warning-foreground"
          : "text-foreground";
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {loading ? (
          <Skeleton className="mt-2 h-8 w-12" />
        ) : (
          <p className={`mt-1 text-3xl font-bold ${toneCls}`}>
            {value == null ? "—" : `${value}${suffix ?? ""}`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
