import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { PublicShell } from "@/components/public-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { publicRuleLibrary } from "@/lib/public.functions";
import { CATEGORY_LABELS } from "@/lib/domain";

const rulesQuery = queryOptions({
  queryKey: ["public-rule-library"],
  queryFn: () => publicRuleLibrary(),
  staleTime: 5 * 60 * 1000,
});

export const Route = createFileRoute("/rules")({
  loader: ({ context }) => context.queryClient.ensureQueryData(rulesQuery),
  head: () => ({
    meta: [
      { title: "Rule library — Legal Metrology 2011 checks | SCANOVA-AI" },
      {
        name: "description",
        content:
          "Every automated check used by SCANOVA-AI, with its rule number, requirement text and page reference in the Legal Metrology (Packaged Commodities) Rules, 2011.",
      },
      { property: "og:title", content: "Rule library — Legal Metrology 2011 checks" },
      {
        property: "og:description",
        content: "Transparent list of the deterministic checks applied to packaged commodities.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RulesPage,
});

interface RuleRow {
  id: string;
  rule_number: string;
  title: string;
  requirement: string;
  check_type: string;
  exceptions: string | null;
  source_section: string | null;
  source_page: number | null;
  applicable_categories: string[] | null;
}

function RulesPage() {
  const { data } = useSuspenseQuery(rulesQuery);
  const [q, setQ] = useState("");
  const all = data.rules as unknown as RuleRow[];

  const rules = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return all;
    return all.filter((r) =>
      [r.rule_number, r.title, r.requirement, r.source_section]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
    );
  }, [all, q]);

  return (
    <PublicShell active="rules">
      <h1 className="text-2xl font-bold md:text-3xl">Rule library</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        {data.version
          ? `Rule set ${data.version.label} — extracted from ${data.version.source ?? "the Legal Metrology (Packaged Commodities) Rules, 2011"}. Every check below cites its source page.`
          : "No active rule set is published yet."}
      </p>

      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by rule number or wording"
        aria-label="Search rules"
        className="mt-5 max-w-md"
      />

      <div className="mt-5 space-y-3">
        {rules.map((r) => (
          <Card key={r.id}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">
                  {r.rule_number} — {r.title}
                </CardTitle>
                <Badge variant="outline">{String(r.check_type).replace(/_/g, " ")}</Badge>
              </div>
              <CardDescription>
                {r.source_section}
                {r.source_page ? ` · page ${r.source_page}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>{r.requirement}</p>
              {r.exceptions && (
                <p className="text-muted-foreground">
                  <span className="font-medium">Exceptions: </span>
                  {r.exceptions}
                </p>
              )}
              {Array.isArray(r.applicable_categories) && r.applicable_categories.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Applies to:{" "}
                  {r.applicable_categories
                    .map((c: string) => CATEGORY_LABELS[c] ?? c)
                    .join(", ")}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
        {rules.length === 0 && (
          <p className="text-sm text-muted-foreground">No rule matches that search.</p>
        )}
      </div>
    </PublicShell>
  );
}
