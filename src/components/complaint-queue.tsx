import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ChevronDown,
  ClipboardCheck,
  HandHeart,
  Loader2,
  MapPin,
  MessageSquareWarning,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import {
  acceptComplaint,
  inspectorComplaintQueue,
  startInspectionFromComplaint,
  updateComplaintStatus,
} from "@/lib/complaints.functions";
import { LocationMap } from "@/components/location-map";
import { ComplaintTimeline } from "@/components/complaint-timeline";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ageInDays, formatWhen } from "@/lib/domain";
import { cn } from "@/lib/utils";

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "submitted", label: "New" },
  { value: "assigned", label: "Assigned" },
  { value: "investigation", label: "Investigating" },
  { value: "under_review", label: "Under review" },
] as const;

/** Complaints an inspector can accept and turn into a real inspection. */
export function InspectorComplaintQueue() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const load = useServerFn(inspectorComplaintQueue);
  const accept = useServerFn(acceptComplaint);
  const start = useServerFn(startInspectionFromComplaint);
  const setStatus = useServerFn(updateComplaintStatus);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [urgentOnly, setUrgentOnly] = useState(false);

  const q = useQuery({ queryKey: ["complaints", "inspector-queue"], queryFn: () => load() });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["complaints"] });
  }

  const acceptM = useMutation({
    mutationFn: (id: string) => accept({ data: { complaintId: id } }),
    onMutate: (id) => setBusy(id),
    onSettled: () => setBusy(null),
    onSuccess: () => {
      toast.success("Complaint accepted. It is now on your list.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const inspectM = useMutation({
    mutationFn: (id: string) => start({ data: { complaintId: id } }),
    onMutate: (id) => setBusy(id),
    onSettled: () => setBusy(null),
    onSuccess: (r) => {
      invalidate();
      navigate({ to: "/inspections/$id", params: { id: r.inspectionId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusM = useMutation({
    mutationFn: (v: { id: string; status: "under_review" | "resolved" | "rejected" }) =>
      setStatus({ data: { complaintId: v.id, status: v.status } }),
    onSuccess: () => {
      toast.success("Progress recorded — the citizen can see this update.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filter = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (rows: Record<string, any>[]) =>
      rows.filter((c) => {
        if (status !== "all" && String(c["status"]) !== status) return false;
        if (urgentOnly && String(c["priority"]) !== "high") return false;
        if (!term) return true;
        return [c["product_name"], c["manufacturer_name"], c["complaint_code"], c["region"], c["description"]]
          .map((v) => String(v ?? "").toLowerCase())
          .some((v) => v.includes(term));
      });
  }, [status, search, urgentOnly]);

  const mine = filter((q.data?.mine ?? []) as Record<string, any>[]);
  const open = filter((q.data?.open ?? []) as Record<string, any>[]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product, company, code or place"
            className="h-9 pl-8"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={status === f.value ? "default" : "outline"}
              onClick={() => setStatusFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
          <Button
            size="sm"
            variant={urgentOnly ? "destructive" : "outline"}
            onClick={() => setUrgentOnly((v) => !v)}
          >
            Urgent only
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Complaints assigned to me</CardTitle>
            <CardDescription>
              Reports you accepted. Open an inspection from one, or record its outcome.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {q.isLoading ? (
              <Skeleton className="h-28 w-full" />
            ) : mine.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing matches on your list right now.</p>
            ) : (
              mine.map((c) => (
                <ComplaintCard
                  key={String(c["id"])}
                  complaint={c}
                  actions={
                    <>
                      <Button size="sm" onClick={() => inspectM.mutate(String(c["id"]))} disabled={busy === c["id"]}>
                        {busy === c["id"] ? (
                          <Loader2 className="mr-1.5 size-4 animate-spin" />
                        ) : (
                          <ClipboardCheck className="mr-1.5 size-4" />
                        )}
                        {c["inspection_id"] ? "Open inspection" : "Inspect this"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => statusM.mutate({ id: String(c["id"]), status: "resolved" })}
                        disabled={statusM.isPending}
                      >
                        Mark resolved
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => statusM.mutate({ id: String(c["id"]), status: "rejected" })}
                        disabled={statusM.isPending}
                      >
                        Not a breach
                      </Button>
                    </>
                  }
                />
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Open complaints near you</CardTitle>
            <CardDescription>Unclaimed citizen reports in your authority. Accept one to take it on.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {q.isLoading ? (
              <Skeleton className="h-28 w-full" />
            ) : open.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-6 text-center">
                <MessageSquareWarning className="mx-auto size-6 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">No unclaimed complaints match these filters.</p>
              </div>
            ) : (
              open.map((c) => (
                <ComplaintCard
                  key={String(c["id"])}
                  complaint={c}
                  actions={
                    <Button size="sm" onClick={() => acceptM.mutate(String(c["id"]))} disabled={busy === c["id"]}>
                      {busy === c["id"] ? (
                        <Loader2 className="mr-1.5 size-4 animate-spin" />
                      ) : (
                        <HandHeart className="mr-1.5 size-4" />
                      )}
                      Accept
                    </Button>
                  }
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ComplaintCard({
  complaint,
  actions,
}: {
  complaint: Record<string, any>;
  actions: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const age = ageInDays(complaint["created_at"]);
  const hasPlace = complaint["latitude"] != null && complaint["longitude"] != null;

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm font-semibold">{String(complaint["product_name"] ?? "Package")}</p>
        <Badge variant="outline" className="capitalize">
          {String(complaint["status"] ?? "").replace(/_/g, " ")}
        </Badge>
        <Badge variant={complaint["priority"] === "high" ? "destructive" : "secondary"} className="capitalize">
          {String(complaint["priority"] ?? "normal")}
        </Badge>
        {age != null && (
          <Badge variant={age >= 7 ? "destructive" : age >= 3 ? "outline" : "secondary"}>
            {age === 0 ? "today" : `${age}d old`}
          </Badge>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {String(complaint["complaint_code"] ?? "")} · {formatWhen(complaint["created_at"])}
        {complaint["manufacturer_name"] ? ` · ${String(complaint["manufacturer_name"])}` : ""}
      </p>
      <p className={cn("mt-2 text-sm", open ? "" : "line-clamp-2")}>
        {String(complaint["description"] ?? "")}
      </p>

      {hasPlace && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="size-3.5" />
          {String(complaint["region"] ?? "Location shared by the reporter")}
        </p>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-2 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        {open ? "Hide details" : "Show map, photo and progress"}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <LocationMap
            latitude={complaint["latitude"] != null ? Number(complaint["latitude"]) : null}
            longitude={complaint["longitude"] != null ? Number(complaint["longitude"]) : null}
            label={(complaint["region"] as string | null) ?? null}
            height={170}
          />

          {complaint["evidence_url"] ? (
            <a href={String(complaint["evidence_url"])} target="_blank" rel="noreferrer">
              <img
                src={String(complaint["evidence_url"])}
                alt="Photo submitted with the complaint"
                className="max-h-48 w-full rounded-md border border-border object-cover"
                loading="lazy"
              />
            </a>
          ) : (
            <p className="text-xs text-muted-foreground">No photo was attached to this report.</p>
          )}

          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Progress
            </h4>
            <ComplaintTimeline complaintId={String(complaint["id"])} />
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}
