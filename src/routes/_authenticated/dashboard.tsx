import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "My workspace — SCANOVA-AI" },
      { name: "description", content: "Opens the workspace that belongs to your role." },
      { property: "og:title", content: "My workspace — SCANOVA-AI" },
      { property: "og:description", content: "Role-specific compliance workspace in SCANOVA-AI." },
    ],
  }),
  component: DashboardRouter,
});

/** Each role has its own home screen; this only decides which one to open. */
function homeFor(roles: string[]): string {
  if (roles.some((r) => ["authority_admin", "system_admin"].includes(r))) return "/government";
  if (roles.includes("supervisor")) return "/supervisor";
  if (roles.includes("inspector")) return "/inspector";
  if (roles.includes("manufacturer")) return "/products";
  return "/citizen";
}

function DashboardRouter() {
  const { roles, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    navigate({ to: homeFor(roles), replace: true });
  }, [loading, roles, navigate]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> Opening your workspace…
    </div>
  );
}
