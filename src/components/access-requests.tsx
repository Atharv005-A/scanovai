import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { decideRoleRequest, listRoleRequests } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ROLE_LABELS } from "@/lib/domain";

/** Approval queue for accounts asking for a privileged role. */
export function AccessRequestsPanel() {
  const queryClient = useQueryClient();
  const load = useServerFn(listRoleRequests);
  const decide = useServerFn(decideRoleRequest);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const q = useQuery({ queryKey: ["role-requests"], queryFn: () => load() });

  const act = useMutation({
    mutationFn: (input: { requestId: string; approve: boolean }) =>
      decide({
        data: {
          requestId: input.requestId,
          approve: input.approve,
          ...(reasons[input.requestId]?.trim() ? { reason: reasons[input.requestId]!.trim() } : {}),
        },
      }),
    onSuccess: (_r, v) => {
      toast.success(v.approve ? "Access granted." : "Request declined.");
      queryClient.invalidateQueries({ queryKey: ["role-requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (q.data?.requests ?? []) as Record<string, any>[];
  const pending = rows.filter((r) => r["status"] === "pending");
  const decided = rows.filter((r) => r["status"] !== "pending").slice(0, 8);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Access requests</CardTitle>
        <CardDescription>
          Accounts asking for a staff role. Approving grants the role and attaches the person to your authority.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {q.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">No requests are waiting for a decision.</p>
        ) : (
          <ul className="divide-y divide-border">
            {pending.map((r) => {
              const id = r["id"] as string;
              const profile = r["profile"] as { full_name?: string; email?: string } | null;
              const role = String(r["requested_role"] ?? "");
              return (
                <li key={id} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="flex-1 text-sm font-medium">
                      {profile?.full_name || "Unnamed account"}{" "}
                      <span className="font-normal text-muted-foreground">{profile?.email}</span>
                    </p>
                    <Badge variant="outline">{ROLE_LABELS[role] ?? role.replace(/_/g, " ")}</Badge>
                  </div>
                  {r["justification"] ? (
                    <p className="text-sm text-muted-foreground">{String(r["justification"])}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">No justification was given.</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Requested {new Date(String(r["created_at"])).toLocaleString()}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={reasons[id] ?? ""}
                      onChange={(e) => setReasons((s) => ({ ...s, [id]: e.target.value }))}
                      placeholder="Reason (optional, shared with the applicant)"
                      className="h-9 flex-1 min-w-48"
                    />
                    <Button
                      size="sm"
                      onClick={() => act.mutate({ requestId: id, approve: true })}
                      disabled={act.isPending}
                    >
                      {act.isPending ? (
                        <Loader2 className="mr-1.5 size-4 animate-spin" />
                      ) : (
                        <Check className="mr-1.5 size-4" />
                      )}
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => act.mutate({ requestId: id, approve: false })}
                      disabled={act.isPending}
                    >
                      <X className="mr-1.5 size-4" /> Decline
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {decided.length > 0 && (
          <div className="border-t border-border pt-3">
            <h3 className="mb-2 text-sm font-semibold">Recently decided</h3>
            <ul className="space-y-1.5">
              {decided.map((r) => (
                <li key={String(r["id"])} className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground">
                    {(r["profile"] as { email?: string } | null)?.email ?? "account"}
                  </span>
                  <Badge variant="secondary">
                    {ROLE_LABELS[String(r["requested_role"])] ?? String(r["requested_role"])}
                  </Badge>
                  <span className="capitalize text-muted-foreground">{String(r["status"])}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
