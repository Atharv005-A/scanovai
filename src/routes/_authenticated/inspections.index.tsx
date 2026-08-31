import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Search } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OverallBadge } from "@/components/status";
import { CATEGORY_LABELS } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/inspections/")({
  head: () => ({
    meta: [
      { title: "Inspections — SCANOVA-AI" },
      { name: "description", content: "Search and filter packaged commodity compliance inspections." },
      { property: "og:title", content: "Inspections — SCANOVA-AI" },
      { property: "og:description", content: "All inspection records you are permitted to see." },
    ],
  }),
  component: InspectionList,
});

function InspectionList() {
  const [q, setQ] = useState("");
  const [result, setResult] = useState("all");
  const [status, setStatus] = useState("all");

  const list = useQuery({
    queryKey: ["inspections", "list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspections")
        .select(
          "id, reference_code, product_name, manufacturer_name, category, status, result, assessment_score, is_demo, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  const rows = (list.data ?? []).filter((r) => {
    if (result !== "all" && r.result !== result) return false;
    if (status !== "all" && r.status !== status) return false;
    if (!q.trim()) return true;
    const hay = `${r.reference_code} ${r.product_name ?? ""} ${r.manufacturer_name ?? ""}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Inspections</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {list.isLoading ? "Loading records…" : `${rows.length} record(s)`}
          </p>
        </div>
        <Button asChild>
          <Link to="/inspections/new">
            <Plus className="mr-2 size-4" /> New inspection
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search reference, product or manufacturer"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select value={result} onValueChange={setResult}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Result" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All results</SelectItem>
            <SelectItem value="compliant">Compliant</SelectItem>
            <SelectItem value="non_compliant">Non-compliant</SelectItem>
            <SelectItem value="needs_review">Needs review</SelectItem>
            <SelectItem value="unable_to_verify">Unable to verify</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="capturing">Capturing</SelectItem>
            <SelectItem value="extracted">Extracted</SelectItem>
            <SelectItem value="checked">Checked</SelectItem>
            <SelectItem value="finalized">Finalized</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {list.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No inspections match these filters.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  to="/inspections/$id"
                  params={{ id: r.id }}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/50"
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
                      {r.reference_code} · {CATEGORY_LABELS[r.category] ?? r.category}
                      {r.manufacturer_name ? ` · ${r.manufacturer_name}` : ""} ·{" "}
                      {new Date(r.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {r.assessment_score !== null && (
                    <span className="text-xs text-muted-foreground">{r.assessment_score}% checks passed</span>
                  )}
                  <Badge variant="secondary" className="capitalize">
                    {r.status}
                  </Badge>
                  <OverallBadge result={r.result} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
