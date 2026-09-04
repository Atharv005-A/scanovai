import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardList, Plus, RefreshCw } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { inspectorDashboard } from "@/lib/analytics.functions";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { OverallBadge } from "@/components/status";
import { CATEGORY_LABELS } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/inspector")({
  head: () => ({
    meta: [
      { title: "Inspector dashboard — SCANOVA-AI" },
      {
        name: "description",
        content:
          "Your own field inspection workload: today's checks, outcomes, sync queue and recent records.",
      },
      { property: "og:title", content: "Inspector dashboard — SCANOVA-AI" },
      {
        property: "og:description",
        content: "Live view of your inspections, outcomes and pending offline sync.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InspectorDashboard,
});

function InspectorDashboard() {
  const { roles } = useAuth();
  const isInspector = roles.includes("inspector");
  const load = useServerFn(inspectorDashboard);

  const q = useQuery({
    queryKey: ["dashboard", "inspector"],
    queryFn: () => load(),
    enabled: isInspector,
  });

  if (roles.length > 0 && !isInspector) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">For inspectors only</CardTitle>
          <CardDescription>
            This dashboard belongs to field inspectors. Ask a government authority administrator to grant you
            the inspector role, or open your own dashboard instead.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link to="/dashboard">Go to my dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const d = q.data;
  const counts = d?.counts;


  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Inspector dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your own inspections over the last 30 days. Every figure comes from your live records.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/inspections/new">
              <Plus className="mr-2 size-4" /> New inspection
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/inspections">All inspections</Link>
          </Button>
          <Button variant="ghost" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={`mr-2 size-4 ${q.isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      {q.error ? (
        <p className="text-sm text-destructive">Your figures could not be loaded. Please refresh the page.</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Today" value={counts?.today} loading={q.isLoading} />
        <Stat label="In progress" value={counts?.inProgress} loading={q.isLoading} />
        <Stat label="Finalized" value={counts?.finalized} tone="success" loading={q.isLoading} />
        <Stat label="Non-compliant" value={counts?.nonCompliant} tone="destructive" loading={q.isLoading} />
        <Stat label="Needs review" value={counts?.review} tone="warning" loading={q.isLoading} />
        <Stat label="Awaiting supervisor" value={counts?.awaitingSupervisor} loading={q.isLoading} />
        <Stat label="Not yet synced" value={counts?.pendingSync} tone="warning" loading={q.isLoading} />
        <Stat label="Sync queue items" value={d?.queue.length} loading={q.isLoading} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Last 30 days</CardTitle>
            <CardDescription>Inspections you recorded, by outcome.</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {q.isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (d?.trend ?? []).length === 0 ? (
              <Empty>No inspections recorded in this window yet.</Empty>
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
                  <Line
                    type="monotone"
                    dataKey="review"
                    name="Needs review"
                    stroke="#d68910"
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
            <CardTitle className="text-lg">By category</CardTitle>
            <CardDescription>What kind of packages you inspected.</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {q.isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (d?.categories ?? []).length === 0 ? (
              <Empty>No categories to show yet.</Empty>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={(d?.categories ?? []).map((c) => ({
                    name: CATEGORY_LABELS[c.label] ?? c.label,
                    count: c.count,
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-15} height={50} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Inspections" fill="#2471a3" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent inspections</CardTitle>
          <CardDescription>Your latest records.</CardDescription>
        </CardHeader>
        <CardContent>
          {q.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : (d?.recent ?? []).length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-center">
              <ClipboardList className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                No inspections yet. Start one to see it here.
              </p>
            </div>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Offline sync queue</CardTitle>
          <CardDescription>
            Work captured offline that is still waiting to reach the server. Nothing is hidden here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {q.isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : (d?.queue ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Everything is synced.</p>
          ) : (
            <ul className="divide-y divide-border">
              {(d?.queue ?? []).map((item) => (
                <li key={String(item['id'])} className="flex flex-wrap items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium capitalize">
                      {String(item['operation'] ?? "operation").replace(/[._]/g, " ")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item['last_error'] ? String(item['last_error']) : "Queued"} · attempt{" "}
                      {String(item['attempts'] ?? 0)}
                    </p>
                  </div>
                  <Badge
                    variant={item['status'] === "failed" ? "destructive" : "secondary"}
                    className="capitalize"
                  >
                    {String(item['status'])}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
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
  tone,
  loading,
}: {
  label: string;
  value: number | undefined;
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
          <p className={`mt-1 text-3xl font-bold ${toneCls}`}>{value ?? 0}</p>
        )}
      </CardContent>
    </Card>
  );
}
