import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ScanLine,
  ShieldCheck,
  FileText,
  Gavel,
  Camera,
  Sparkles,
  BarChart3,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SCANOVA-AI — Packaged Commodity Compliance Inspection" },
      {
        name: "description",
        content:
          "Scan a packaged commodity, read its label declarations with AI and check them against the Legal Metrology (Packaged Commodities) Rules, 2011.",
      },
      { property: "og:title", content: "SCANOVA-AI — Packaged Commodity Compliance Inspection" },
      {
        property: "og:description",
        content:
          "Evidence-based inspection: capture, extract, check against the 2011 Rules, review and report.",
      },
    ],
  }),
  component: Landing,
});

const STEPS = [
  { icon: Camera, title: "Capture", text: "Photograph each side of the package, or upload images." },
  { icon: Sparkles, title: "Extract", text: "AI reads the printed declarations and reports its confidence." },
  { icon: Gavel, title: "Check", text: "Deterministic rules from the 2011 Rules decide pass, fail or review." },
  { icon: FileText, title: "Report", text: "Finalize and generate a traceable PDF inspection report." },
];

function Landing() {
  const { session, loading } = useAuth();

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <ScanLine className="size-5" />
            </span>
            <div className="leading-tight">
              <p className="font-display text-lg font-bold">SCANOVA-AI</p>
              <p className="text-xs text-primary-foreground/70">Legal Metrology compliance inspection</p>
            </div>
          </div>
          {loading ? null : session ? (
            <Button asChild variant="secondary">
              <Link to="/dashboard">Open dashboard</Link>
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button asChild variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10">
                <Link to="/auth" search={{ mode: "signin" }}>
                  Sign in
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link to="/auth" search={{ mode: "signup" }}>
                  Create account
                </Link>
              </Button>
            </div>
          )}
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-14 md:py-20">
        <Badge variant="outline" className="border-accent/50 bg-accent/15 text-accent-foreground">
          SIH26034 · Legal Metrology (Packaged Commodities) Rules, 2011
        </Badge>
        <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-tight text-foreground md:text-5xl">
          Inspect packaged commodities with evidence, not guesswork.
        </h1>
        <p className="mt-4 max-w-2xl text-base text-muted-foreground md:text-lg">
          SCANOVA-AI reads the declarations printed on a package, then checks them against machine-readable
          rules taken only from the official 2011 Rules document. Every result shows what was detected, what
          was expected and which rule it came from.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to={session ? "/dashboard" : "/auth"} search={session ? undefined : { mode: "signup" }}>
              {session ? "Go to my workspace" : "Get started"}
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/auth" search={{ mode: "signin" }}>
              I already have an account
            </Link>
          </Button>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <Card key={s.title} className="border-border/80">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <s.icon className="size-5 text-accent" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Step {i + 1}</span>
                </div>
                <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-t border-border bg-secondary/40">
        <div className="mx-auto grid max-w-6xl gap-6 px-5 py-14 md:grid-cols-3">
          <Feature
            icon={Gavel}
            title="Rules only from the official document"
            text="Every check stores its rule number, section and page. Requirements that cannot be judged from a photograph are marked as manual verification required instead of being invented."
          />
          <Feature
            icon={ShieldCheck}
            title="Secure and auditable"
            text="Role-based access, authority-level isolation, private evidence storage and an audit trail for every extraction, correction and report."
          />
          <Feature
            icon={BarChart3}
            title="Dashboards on real data"
            text="Inspectors, supervisors and authority administrators see live counts and trends drawn from actual inspection records."
          />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-14">
        <h2 className="text-2xl font-semibold">Who uses SCANOVA-AI</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Inspector", "Run the full inspection workflow in the field, with or without a connection."],
            ["Supervisor", "Review flagged and manual-review cases raised by the team."],
            ["Authority administrator", "Manage offices, members and authority-wide analytics."],
            ["Manufacturer / packer", "Maintain a product catalogue and respond to flagged issues."],
            ["Citizen", "Report a suspected non-compliant package and track the complaint."],
          ].map(([role, text]) => (
            <Card key={role}>
              <CardContent className="flex gap-3 pt-6">
                <Users className="size-5 shrink-0 text-accent" />
                <div>
                  <p className="font-semibold">{role}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{text}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        SCANOVA-AI · Built for SIH26034. System assessment results are advisory; official enforcement
        decisions rest with authorized officers.
      </footer>
    </main>
  );
}

function Feature({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Gavel;
  title: string;
  text: string;
}) {
  return (
    <div>
      <Icon className="size-6 text-accent" />
      <h3 className="mt-3 text-lg font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
