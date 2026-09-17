import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardCheck, RefreshCw } from "lucide-react";

import { ChartFrame, TrendArea, RankedBars } from "@/components/charts";


import { supervisorDashboard } from "@/lib/analytics.functions";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { OverallBadge } from "@/components/status";
import { AuthorityComplaintPanel } from "@/components/authority-complaints";
import { formatWhen } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/supervisor")({
  head: () => ({
    meta: [
      { title: "Supervisor dashboard — SCANOVA-AI" },
      {
        name: "description",
        content: "Review inspections your officers escalated, watch team output and close citizen complaints.",
      },
      { property: "og:title", content: "Supervisor dashboard — SCANOVA-AI" },
      {
        property: "og:description",
        content: "Escalated inspections, team performance and complaint oversight in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SupervisorDashboard,
});

function SupervisorDashboard() {
  const { roles } = useAuth();
  const allowed = roles.some((r) => ["supervisor", "authority_admin", "system_admin"].includes(r));
  const load = useServerFn(supervisorDashboard);

  const q = useQuery({
    queryKey: ["dashboard", "supervisor"],
    queryFn: () => load({ data: {} }),
    enabled: allowed,
  });

  if (roles.length > 0 && !allowed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">For supervisors only</CardTitle>
          <CardDescription>
            This screen belongs to supervising officers. Open your own workspace instead.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link to="/dashboard">Go to my workspace</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const d = q.data;
  const c = d?.counts;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Supervisor dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Inspections waiting on your decision, plus how your officers are doing over the last 30 days.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/inspections">All inspections</Link>
          </Button>
          <Button variant="ghost" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={`mr-2 size-4 ${q.isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      {q.error ? (
        <p className="text-sm text-destructive">These figures could not be loaded. Please refresh the page.</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Waiting on my review" value={c?.pendingReview} loading={q.isLoading} tone="warning" />
        <Stat label="Inspections in window" value={c?.total} loading={q.isLoading} />
        <Stat label="Finalized" value={c?.finalized} loading={q.isLoading} tone="success" />
        <Stat label="Non-compliant" value={c?.nonCompliant} loading={q.isLoading} tone="destructive" />
        <Stat label="Needs review" value={c?.review} loading={q.isLoading} tone="warning" />
        <Stat label="Conflicting packages" value={c?.conflicts} loading={q.isLoading} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Escalated to me</CardTitle>
          <CardDescription>Inspections an officer asked you to confirm. Open one to decide.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {q.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (d?.queue ?? []).length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-8 text-center">
              <ClipboardCheck className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">Nothing is waiting for your decision.</p>
            </div>
          ) : (
            (d?.queue ?? []).map((r: Record<string, any>) => (
              <Link
                key={String(r["id"])}
                to="/inspections/$id"
                params={{ id: String(r["id"]) }}
                className="block rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="flex-1 text-sm font-semibold">
                    {String(r["product_name"] ?? "Unnamed package")}
                  </p>
                  <OverallBadge result={String(r["result"] ?? "pending")} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {String(r["reference_code"] ?? "")} · {formatWhen(r["updated_at"] ?? r["created_at"])}
                </p>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Last 30 days</CardTitle>
            <CardDescription>Inspections recorded across your team, by outcome.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartFrame
              loading={q.isLoading}
              empty={(d?.trend ?? []).length === 0}
              emptyText="No inspections in this window yet."
            >
              <TrendArea
                data={d?.trend ?? []}
                series={[
                  { key: "compliant", name: "Compliant", color: "var(--success)" },
                  { key: "nonCompliant", name: "Non-compliant", color: "var(--destructive)" },
                  { key: "review", name: "Needs review", color: "var(--warning)" },
                ]}
              />
            </ChartFrame>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Officer output</CardTitle>
            <CardDescription>Inspections recorded per officer in this window.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartFrame
              loading={q.isLoading}
              empty={(d?.inspectors ?? []).length === 0}
              emptyText="No officer activity yet."
            >
              <RankedBars data={d?.inspectors ?? []} name="Inspections" color="var(--chart-4)" labelWidth={140} />
            </ChartFrame>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Most common failures</CardTitle>
          <CardDescription>Which declaration rules fail most often in this window.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartFrame
            loading={q.isLoading}
            empty={(d?.ruleFailures ?? []).length === 0}
            emptyText="No failed checks recorded yet."
            height="h-80"
          >
            <RankedBars
              data={d?.ruleFailures ?? []}
              name="Failures"
              color="var(--destructive)"
              labelWidth={210}
            />
          </ChartFrame>
        </CardContent>
      </Card>


      <AuthorityComplaintPanel />
    </div>
  );
}

function Stat({
  label,
  value,
  loading,
  tone,
}: {
  label: string;
  value?: number | undefined;
  loading: boolean;
  tone?: "success" | "warning" | "destructive" | undefined;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-14" />
      ) : (
        <p className="mt-1 flex items-center gap-2 text-3xl font-semibold">
          {value ?? 0}
          {tone && (value ?? 0) > 0 ? (
            <Badge
              variant={tone === "destructive" ? "destructive" : "secondary"}
              className="text-[10px] uppercase"
            >
              {tone === "success" ? "done" : tone === "warning" ? "action" : "issue"}
            </Badge>
          ) : null}
        </p>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{children}</div>
  );
}
