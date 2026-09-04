import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Sparkles, ClipboardList, MessageSquareWarning, Gauge, Landmark } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { loadDemoData } from "@/lib/workspace.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { OverallBadge } from "@/components/status";
import { CATEGORY_LABELS } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — SCANOVA-AI" },
      { name: "description", content: "Your compliance inspection workload, results and complaints." },
      { property: "og:title", content: "Dashboard — SCANOVA-AI" },
      { property: "og:description", content: "Live compliance inspection activity in SCANOVA-AI." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { profile, roles, isGovStaff } = useAuth();
  const queryClient = useQueryClient();
  const seed = useServerFn(loadDemoData);

  const inspections = useQuery({
    queryKey: ["inspections", "recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspections")
        .select(
          "id, reference_code, product_name, category, status, result, assessment_score, is_demo, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const complaints = useQuery({
    queryKey: ["complaints", "count"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("complaints")
        .select("id, status, product_name, created_at, complaint_code")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const myRequests = useQuery({
    queryKey: ["my-role-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_requests")
        .select("id, requested_role, status, created_at, decided_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const demo = useMutation({
    mutationFn: () => seed(),
    onSuccess: () => {
      toast.success("Demo inspections created and evaluated by the real rule engine.");
      queryClient.invalidateQueries({ queryKey: ["inspections"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = inspections.data ?? [];
  const counts = {
    total: rows.length,
    compliant: rows.filter((r) => r.result === "compliant").length,
    non: rows.filter((r) => r.result === "non_compliant").length,
    review: rows.filter((r) => r.result === "needs_review" || r.result === "unable_to_verify").length,
    open: rows.filter((r) => r.status !== "finalized" && r.status !== "cancelled").length,
  };

  const isCitizen = roles.length > 0 && !isGovStaff && !roles.includes("manufacturer");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {profile?.full_name ? `Welcome, ${profile.full_name.split(" ")[0]}` : "Welcome"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything below is drawn from your live inspection records.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {roles.includes("inspector") && (
            <Button asChild variant="secondary">
              <Link to="/inspector">
                <Gauge className="mr-2 size-4" /> Inspector dashboard
              </Link>
            </Button>
          )}
          {roles.some((r) => ["authority_admin", "system_admin"].includes(r)) && (
            <Button asChild variant="secondary">
              <Link to="/government">
                <Landmark className="mr-2 size-4" /> Government dashboard
              </Link>
            </Button>
          )}
          {isGovStaff && (
            <Button asChild>
              <Link to="/inspections/new">
                <Plus className="mr-2 size-4" /> New inspection
              </Link>
            </Button>
          )}

          {isCitizen && (
            <Button asChild>
              <Link to="/complaints">
                <MessageSquareWarning className="mr-2 size-4" /> Report a package
              </Link>
            </Button>
          )}
          {isGovStaff && (
            <Button variant="outline" onClick={() => demo.mutate()} disabled={demo.isPending}>
              {demo.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 size-4" />
              )}
              Load demo cases
            </Button>
          )}
        </div>
      </div>

      {(myRequests.data ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Your access request</CardTitle>
            <CardDescription>
              Staff roles are granted by a government authority administrator after review.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(myRequests.data ?? []).map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium capitalize">
                  {String(r.requested_role).replace(/_/g, " ")}
                </span>
                <Badge
                  variant={
                    r.status === "approved" ? "default" : r.status === "pending" ? "outline" : "secondary"
                  }
                  className="capitalize"
                >
                  {r.status === "pending" ? "Awaiting approval" : r.status}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Submitted {new Date(r.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}



      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Inspections" value={counts.total} loading={inspections.isLoading} />
        <Stat label="In progress" value={counts.open} loading={inspections.isLoading} />
        <Stat label="Compliant" value={counts.compliant} tone="success" loading={inspections.isLoading} />
        <Stat
          label="Non-compliant"
          value={counts.non}
          tone="destructive"
          loading={inspections.isLoading}
        />
        <Stat label="Needs review" value={counts.review} tone="warning" loading={inspections.isLoading} />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-lg">Recent inspections</CardTitle>
            <CardDescription>Most recent records you are permitted to see.</CardDescription>
          </div>
          {isGovStaff && (
            <Button asChild variant="ghost" size="sm">
              <Link to="/inspections">View all</Link>
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {inspections.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : inspections.error ? (
            <p className="text-sm text-destructive">
              These records could not be loaded. Please refresh the page.
            </p>
          ) : rows.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-center">
              <ClipboardList className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                No inspections yet.{" "}
                {isGovStaff ? "Start one, or load the demo cases to see the pipeline." : ""}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {rows.slice(0, 8).map((r) => (
                <li key={r.id}>
                  <Link
                    to="/inspections/$id"
                    params={{ id: r.id }}
                    className="flex flex-wrap items-center gap-3 py-3 hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {r.product_name || "Untitled package"}
                        {r.is_demo && (
                          <Badge variant="outline" className="ml-2 text-[10px] uppercase">
                            demo
                          </Badge>
                        )}
                      </p>
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
          <CardTitle className="text-lg">Complaints</CardTitle>
          <CardDescription>Citizen reports visible to you.</CardDescription>
        </CardHeader>
        <CardContent>
          {complaints.isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : (complaints.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No complaints recorded.</p>
          ) : (
            <ul className="divide-y divide-border">
              {(complaints.data ?? []).slice(0, 5).map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.product_name}</p>
                    <p className="text-xs text-muted-foreground">{c.complaint_code}</p>
                  </div>
                  <Badge variant="secondary" className="capitalize">
                    {c.status.replace(/_/g, " ")}
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

function Stat({
  label,
  value,
  tone,
  loading,
}: {
  label: string;
  value: number;
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
          <p className={`mt-1 text-3xl font-bold ${toneCls}`}>{value}</p>
        )}
      </CardContent>
    </Card>
  );
}
