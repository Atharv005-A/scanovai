import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { complaintTimeline } from "@/lib/complaints.functions";
import { Skeleton } from "@/components/ui/skeleton";

/** Every recorded step of a complaint, oldest first. */
export function ComplaintTimeline({ complaintId }: { complaintId: string }) {
  const load = useServerFn(complaintTimeline);
  const q = useQuery({
    queryKey: ["complaints", "timeline", complaintId],
    queryFn: () => load({ data: { complaintId } }),
  });

  if (q.isLoading) return <Skeleton className="h-16 w-full" />;
  const updates = (q.data?.updates ?? []) as Record<string, any>[];
  if (updates.length === 0)
    return <p className="text-xs text-muted-foreground">No progress recorded yet.</p>;

  return (
    <ol className="space-y-2 border-l border-border pl-4">
      {updates.map((u) => (
        <li key={String(u["id"])} className="relative">
          <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-primary" />
          <p className="text-sm font-medium capitalize">
            {String(u["status"] ?? "update").replace(/_/g, " ")}
          </p>
          {u["note"] && <p className="text-sm text-muted-foreground">{String(u["note"])}</p>}
          <p className="text-xs text-muted-foreground">
            {new Date(String(u["created_at"])).toLocaleString()}
          </p>
        </li>
      ))}
    </ol>
  );
}
