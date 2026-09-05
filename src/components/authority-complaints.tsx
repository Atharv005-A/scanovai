import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import {
  assignComplaint,
  authorityComplaintQueue,
  updateComplaintStatus,
} from "@/lib/complaints.functions";
import { LocationMap } from "@/components/location-map";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STAGES = ["submitted", "under_review", "assigned", "investigation", "resolved"] as const;

/** Authority-side complaint oversight: assignment, stage tracking and outcome. */
export function AuthorityComplaintPanel() {
  const queryClient = useQueryClient();
  const load = useServerFn(authorityComplaintQueue);
  const assign = useServerFn(assignComplaint);
  const setStatus = useServerFn(updateComplaintStatus);
  const [pick, setPick] = useState<Record<string, string>>({});

  const q = useQuery({ queryKey: ["complaints", "authority-queue"], queryFn: () => load() });

  const assignM = useMutation({
    mutationFn: (v: { complaintId: string; inspectorId: string }) => assign({ data: v }),
    onSuccess: () => {
      toast.success("Complaint assigned to the inspector.");
      queryClient.invalidateQueries({ queryKey: ["complaints"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusM = useMutation({
    mutationFn: (v: { complaintId: string; status: "under_review" | "resolved" | "rejected" | "closed" }) =>
      setStatus({ data: v }),
    onSuccess: () => {
      toast.success("Progress recorded.");
      queryClient.invalidateQueries({ queryKey: ["complaints"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (q.data?.complaints ?? []) as Record<string, any>[];
  const inspectors = (q.data?.inspectors ?? []) as Record<string, any>[];
  const funnel = STAGES.map((s) => ({ stage: s, count: rows.filter((r) => r["status"] === s).length }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Citizen complaints</CardTitle>
        <CardDescription>
          Every report inside your authority, from arrival to outcome. Assign an inspector and the citizen sees
          each step.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {funnel.map((f) => (
            <div key={f.stage} className="rounded-md border border-border p-3">
              <p className="text-xs capitalize text-muted-foreground">{f.stage.replace(/_/g, " ")}</p>
              <p className="text-2xl font-bold">{f.count}</p>
            </div>
          ))}
        </div>

        {q.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No complaints have been filed yet.</p>
        ) : (
          <ul className="space-y-3">
            {rows.slice(0, 20).map((c) => {
              const id = String(c["id"]);
              return (
                <li key={id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="flex-1 text-sm font-semibold">{String(c["product_name"] ?? "Package")}</p>
                    <Badge variant="outline" className="capitalize">
                      {String(c["status"] ?? "").replace(/_/g, " ")}
                    </Badge>
                    {c["inspection_id"] && (
                      <Button asChild size="sm" variant="ghost">
                        <Link to="/inspections/$id" params={{ id: String(c["inspection_id"]) }}>
                          View inspection
                        </Link>
                      </Button>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {String(c["complaint_code"] ?? "")} ·{" "}
                    {new Date(String(c["created_at"])).toLocaleString()}
                    {c["assigned_to"] ? " · assigned" : " · unassigned"}
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm">{String(c["description"] ?? "")}</p>

                  <LocationMap
                    latitude={c["latitude"] != null ? Number(c["latitude"]) : null}
                    longitude={c["longitude"] != null ? Number(c["longitude"]) : null}
                    label={(c["region"] as string | null) ?? null}
                    height={140}
                    className="mt-3"
                  />

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {inspectors.length > 0 && (
                      <>
                        <Select value={pick[id] ?? ""} onValueChange={(v) => setPick((s) => ({ ...s, [id]: v }))}>
                          <SelectTrigger className="h-9 w-56">
                            <SelectValue placeholder="Choose an inspector" />
                          </SelectTrigger>
                          <SelectContent>
                            {inspectors.map((i) => (
                              <SelectItem key={String(i["id"])} value={String(i["id"])}>
                                {String(i["full_name"] || i["email"])}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          disabled={!pick[id] || assignM.isPending}
                          onClick={() => assignM.mutate({ complaintId: id, inspectorId: pick[id]! })}
                        >
                          Assign
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={statusM.isPending}
                      onClick={() => statusM.mutate({ complaintId: id, status: "under_review" })}
                    >
                      Mark under review
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={statusM.isPending}
                      onClick={() => statusM.mutate({ complaintId: id, status: "closed" })}
                    >
                      Close
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
