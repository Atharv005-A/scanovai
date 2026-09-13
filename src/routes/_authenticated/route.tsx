import { createFileRoute, redirect, Outlet, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ScanLine,
  LayoutDashboard,
  ClipboardList,
  MessageSquareWarning,
  Package,
  Building2,
  Gauge,
  Landmark,
  LogOut,
  Menu,
} from "lucide-react";


import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { bootstrapWorkspace } from "@/lib/workspace.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ROLE_LABELS } from "@/lib/domain";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: Shell,
});

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: string[];
}

const NAV: NavItem[] = [
  { to: "/dashboard", label: "My workspace", icon: LayoutDashboard },
  {
    to: "/citizen",
    label: "My reports",
    icon: ScanLine,
    roles: ["citizen"],
  },
  {
    to: "/inspector",
    label: "Inspector dashboard",
    icon: Gauge,
    roles: ["inspector"],
  },
  {
    to: "/supervisor",
    label: "Supervisor dashboard",
    icon: ShieldCheck,
    roles: ["supervisor"],
  },
  {
    to: "/government",
    label: "Government dashboard",
    icon: Landmark,
    roles: ["authority_admin", "system_admin"],
  },
  {
    to: "/inspections",
    label: "Inspections",
    icon: ClipboardList,
    roles: ["inspector", "supervisor", "authority_admin", "system_admin"],
  },
  { to: "/complaints", label: "Complaints", icon: MessageSquareWarning },
  { to: "/products", label: "My products", icon: Package, roles: ["manufacturer"] },
  {
    to: "/authority",
    label: "Authority",
    icon: Building2,
    roles: ["authority_admin", "supervisor", "system_admin"],
  },
];


function Shell() {
  const { profile, roles, primaryRole } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Ensures a profile, role and (for staff) authority membership exist for this account.
    bootstrapWorkspace().catch(() => {
      /* non-fatal: the dashboard surfaces load errors itself */
    });
  }, []);

  const visible = NAV.filter((i) => !i.roles || i.roles.some((r) => roles.includes(r as never)));

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const links = (
    <nav className="flex flex-col gap-1">
      {visible.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          onClick={() => setOpen(false)}
          activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/80",
            "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          )}
        >
          <item.icon className="size-4" />
          {item.label}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-primary text-primary-foreground">
        <div className="flex items-center gap-3 px-4 py-3">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-primary-foreground hover:bg-primary-foreground/10 md:hidden"
                aria-label="Open menu"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 bg-sidebar p-4">
              <div className="mb-6 flex items-center gap-2 font-display text-lg font-bold text-sidebar-foreground">
                <ScanLine className="size-5" /> SCANOVA-AI
              </div>
              {links}
            </SheetContent>
          </Sheet>

          <Link to="/dashboard" className="flex items-center gap-2">
            <ScanLine className="size-5 text-accent" />
            <span className="font-display text-base font-bold">SCANOVA-AI</span>
          </Link>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight">{profile?.full_name ?? "Signed in"}</p>
              <p className="text-xs text-primary-foreground/70">{profile?.email}</p>
            </div>
            {primaryRole && (
              <Badge variant="outline" className="border-accent/50 bg-accent/20 text-accent-foreground">
                {ROLE_LABELS[primaryRole]}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="text-primary-foreground hover:bg-primary-foreground/10"
            >
              <LogOut className="size-4 sm:mr-2" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl">
        <aside className="hidden w-60 shrink-0 border-r border-sidebar-border bg-sidebar p-4 md:block">
          {links}
        </aside>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
