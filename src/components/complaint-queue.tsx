import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ClipboardCheck, HandHeart, Loader2, MessageSquareWarning } from "lucide-react";
import { toast } from "sonner";

import {
  acceptComplaint,
  inspectorComplaintQueue,
  startInspectionFromComplaint,
  updateComplaintStatus,
} from "@/lib/complaints.functions";
import { LocationMap } from "@/components/location-map";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Complaints an inspector can accept and turn into a real inspection. */
export function InspectorComplaintQueue() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const load = useServerFn(inspectorComplaintQueue);
  const accept = useServerFn(acceptComplaint);
  const start = useServerFn(startInspectionFromComplaint);
  const setStatus = useServerFn(updateComplaintStatus);
  const [busy, setBusy] = useState<string | null>(null);

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

  const mine = (q.data?.mine ?? []) as Record<string, any>[];
  const open = (q.data?.open ?? []) as Record<string, any>[];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Complaints assigned to me</CardTitle>
          <CardDescription>Citizen reports you accepted. Open an inspection to examine the package.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {q.isLoading ? (
            <Skeleton className="h-28 w-full" />
          ) : mine.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing assigned to you right now.</p>
          ) : (
            mine.map((c) => (
              <ComplaintCard
                key={String(c["id"])}
                complaint={c}
                busy={busy === c["id"]}
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
              <p className="mt-2 text-sm text-muted-foreground">No unclaimed complaints at the moment.</p>
            </div>
          ) : (
            open.map((c) => (
              <ComplaintCard
                key={String(c["id"])}
                complaint={c}
                busy={busy === c["id"]}
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
  );
}

function ComplaintCard({
  complaint,
  actions,
}: {
  complaint: Record<string, any>;
  busy?: boolean;
  actions: React.ReactNode;
}) {
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
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {String(complaint["complaint_code"] ?? "")} ·{" "}
        {new Date(String(complaint["created_at"])).toLocaleString()}
        {complaint["manufacturer_name"] ? ` · ${String(complaint["manufacturer_name"])}` : ""}
      </p>
      <p className="mt-2 line-clamp-3 text-sm">{String(complaint["description"] ?? "")}</p>

      <LocationMap
        latitude={complaint["latitude"] != null ? Number(complaint["latitude"]) : null}
        longitude={complaint["longitude"] != null ? Number(complaint["longitude"]) : null}
        label={(complaint["region"] as string | null) ?? null}
        height={150}
        className="mt-3"
      />

      {complaint["evidence_url"] && (
        <a href={String(complaint["evidence_url"])} target="_blank" rel="noreferrer">
          <img
            src={String(complaint["evidence_url"])}
            alt="Photo submitted with the complaint"
            className="mt-3 max-h-40 w-full rounded-md border border-border object-cover"
            loading="lazy"
          />
        </a>
      )}

      <div className="mt-3 flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}
