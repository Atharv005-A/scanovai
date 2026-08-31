import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { trackPublicComplaint } from "@/lib/public.functions";

export const Route = createFileRoute("/track")({
  ssr: false,
  validateSearch: z.object({ token: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Track a complaint — SCANOVA-AI" },
      {
        name: "description",
        content:
          "Enter your tracking code to see the current status of a packaged-commodity complaint filed with the authority.",
      },
      { property: "og:title", content: "Track a complaint — SCANOVA-AI" },
      { property: "og:description", content: "Follow the progress of your Legal Metrology complaint." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TrackPage,
});

interface Update {
  status?: string;
  note?: string;
  created_at?: string;
}

function TrackPage() {
  const { token: initial } = Route.useSearch();
  const track = useServerFn(trackPublicComplaint);
  const [token, setToken] = useState(initial ?? "");

  const m = useMutation({
    mutationFn: () => track({ data: { token: token.trim() } }),
    onError: (e: Error) => toast.error(e.message),
  });

  const complaint = m.data?.complaint ?? null;
  const updates: Update[] = Array.isArray(complaint?.["updates"]) ? complaint["updates"] : [];

  return (
    <PublicShell active="track">
      <h1 className="text-2xl font-bold md:text-3xl">Track a complaint</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Use the tracking code shown when the report was filed.
      </p>

      <Card className="mt-6 max-w-xl">
        <CardContent className="pt-6">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              m.mutate();
            }}
          >
            <Input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Tracking code"
              aria-label="Tracking code"
            />
            <Button type="submit" disabled={token.trim().length < 6 || m.isPending}>
              {m.isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              <span className="ml-1.5 hidden sm:inline">Track</span>
            </Button>
          </form>
        </CardContent>
      </Card>

      {m.isSuccess && !complaint && (
        <p className="mt-5 max-w-xl text-sm text-muted-foreground">
          No report matches that tracking code. Check for typing mistakes — the code is case sensitive.
        </p>
      )}

      {complaint && (
        <Card className="mt-5 max-w-xl">
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="text-base">{String(complaint["complaint_code"] ?? "")}</CardTitle>
              <CardDescription>{String(complaint["product_name"] ?? "")}</CardDescription>
            </div>
            <Badge variant="outline" className="capitalize">
              {String(complaint["status"] ?? "").replace(/_/g, " ")}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Filed on" value={formatDate(complaint["created_at"])} />
            <Row label="Last update" value={formatDate(complaint["updated_at"])} />
            <Row label="Priority" value={String(complaint["priority"] ?? "—")} />
            {complaint["resolution_note"] && (
              <p className="rounded-md bg-muted/50 p-3">{String(complaint["resolution_note"])}</p>
            )}

            {updates.length > 0 && (
              <div>
                <h2 className="mb-2 font-semibold">Progress</h2>
                <ol className="space-y-2 border-l border-border pl-4">
                  {updates.map((u, i) => (
                    <li key={i}>
                      <p className="font-medium capitalize">{String(u.status ?? "").replace(/_/g, " ")}</p>
                      {u.note && <p className="text-muted-foreground">{u.note}</p>}
                      <p className="text-xs text-muted-foreground">{formatDate(u.created_at)}</p>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </PublicShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function formatDate(value?: unknown) {
  if (!value || typeof value !== "string") return "—";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}
