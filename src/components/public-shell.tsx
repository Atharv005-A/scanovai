import { Link } from "@tanstack/react-router";
import { ScanLine } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Shared chrome for the pages a visitor can use without an account. */
export function PublicShell({
  children,
  active,
}: {
  children: React.ReactNode;
  active?: "scan" | "report" | "track" | "rules";
}) {
  const links: { to: "/scan" | "/report" | "/track" | "/rules"; key: string; label: string }[] = [
    { to: "/scan", key: "scan", label: "Check a package" },
    { to: "/report", key: "report", label: "Report a problem" },
    { to: "/track", key: "track", label: "Track a report" },
    { to: "/rules", key: "rules", label: "Rule library" },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <ScanLine className="size-5 text-accent" />
            <span className="font-display text-base font-bold">SCANOVA-AI</span>
          </Link>
          <nav className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
            {links.map((l) => (
              <Link
                key={l.key}
                to={l.to}
                className={
                  "whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors " +
                  (active === l.key
                    ? "bg-primary-foreground/15 text-primary-foreground"
                    : "text-primary-foreground/75 hover:bg-primary-foreground/10")
                }
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <Button asChild size="sm" variant="secondary" className="ml-auto">
            <Link to="/auth" search={{ mode: "signin" }}>
              Officer sign in
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>

      <footer className="border-t border-border px-4 py-6 text-center text-xs text-muted-foreground">
        Consumer information only. Enforcement decisions under the Legal Metrology (Packaged
        Commodities) Rules, 2011 rest with authorised officers.
      </footer>
    </div>
  );
}
