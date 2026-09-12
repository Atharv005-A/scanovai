import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Camera, FileWarning, MessageSquareWarning, ScanLine } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatWhen } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/citizen")({
  head: () => ({
    meta: [
      { title: "My reports — SCANOVA-AI" },
      {
        name: "description",
        content: "Scan a package, report a labelling problem and follow what happens to each of your reports.",
      },
      { property: "og:title", content: "My reports — SCANOVA-AI" },
      {
        property: "og:description",
        content: "Track the packaged-goods complaints you filed and their progress.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CitizenHome,
});

const STATUS_TONE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  submitted: "secondary",
  under_review: "outline",
  assigned: "outline",
  investigation: "outline",
  resolved: "default",
  rejected: "destructive",
  closed: "secondary",
};

function CitizenHome() {
  const { user, profile } = useAuth();

  const q = useQuery({
    queryKey: ["complaints", "mine", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("complaints")
        .select("id, complaint_code, product_name, status, priority, created_at, updated_at, resolution_note")
        .eq("complainant_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = q.data ?? [];
  const openCount = rows.filter((r) => !["resolved", "rejected", "closed"].includes(String(r.status))).length;
  const doneCount = rows.length - openCount;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">
          Hello{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Check a package label, or report one that looks wrong. You can follow every report you file here.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <ActionCard
          to="/scan"
          icon={ScanLine}
          title="Check a package"
          body="Scan the barcode or photograph the label to see what the law requires."
        />
        <ActionCard
          to="/complaints"
          icon={MessageSquareWarning}
          title="Report a problem"
          body="Send a photo and your location to the legal metrology office."
        />
        <ActionCard
          to="/rules"
          icon={FileWarning}
          title="Read the rules"
          body="The declarations every packaged product must carry."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Stat label="Reports being looked at" value={openCount} loading={q.isLoading} />
        <Stat label="Reports closed" value={doneCount} loading={q.isLoading} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">My reports</CardTitle>
          <CardDescription>Open a report to see its full progress trail and the officer's notes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {q.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : rows.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-8 text-center">
              <Camera className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                You have not reported anything yet. Found a package with a missing price or weight?
              </p>
              <Button asChild className="mt-3" size="sm">
                <Link to="/complaints">Report it</Link>
              </Button>
            </div>
          ) : (
            rows.map((r) => (
              <Link
                key={String(r.id)}
                to="/complaints"
                className="block rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="flex-1 text-sm font-semibold">{String(r.product_name ?? "Package")}</p>
                  <Badge variant={STATUS_TONE[String(r.status)] ?? "secondary"} className="capitalize">
                    {String(r.status).replace(/_/g, " ")}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {String(r.complaint_code)} · reported {formatWhen(r.created_at as string)}
                </p>
                {r.resolution_note ? (
                  <p className="mt-2 text-sm text-muted-foreground">{String(r.resolution_note)}</p>
                ) : null}
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ActionCard({
  to,
  icon: Icon,
  title,
  body,
}: {
  to: string;
  icon: typeof ScanLine;
  title: string;
  body: string;
}) {
  return (
    <Link
      to={to}
      className="rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-md"
    >
      <Icon className="size-5 text-accent" />
      <p className="mt-2 font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </Link>
  );
}

function Stat({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-12" />
      ) : (
        <p className="mt-1 text-3xl font-semibold">{value}</p>
      )}
    </div>
  );
}
