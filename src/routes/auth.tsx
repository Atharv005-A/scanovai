import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { ScanLine, Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ROLE_LABELS } from "@/lib/domain";
import { useAuth } from "@/hooks/use-auth";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup", "forgot"]).optional(),
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in — SCANOVA-AI" },
      {
        name: "description",
        content: "Sign in or create an account to run packaged commodity compliance inspections.",
      },
      { property: "og:title", content: "Sign in — SCANOVA-AI" },
      { property: "og:description", content: "Access the SCANOVA-AI compliance inspection workspace." },
    ],
  }),
  component: AuthPage,
});

/**
 * Only these three can be asked for on the public form. Supervisor and
 * authority administrator accounts are never self-created — they sign in with
 * accounts an authority already holds (demo logins are listed on the sign-in
 * tab for the prototype).
 */
const SIGNUP_ROLES = ["citizen", "inspector", "manufacturer"] as const;

const SIGNUP_ROLE_NOTES: Record<string, string> = {
  citizen: "Immediate access: scan packages, report a package and track your reports.",
  inspector: "A government authority administrator must approve your account first.",
  manufacturer: "An inspector (or authority administrator) must verify your company first.",
};

function safeRedirect(value: string | undefined) {
  if (!value) return "/dashboard";
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [tab, setTab] = useState(search.mode === "signup" ? "signup" : "signin");
  const target = safeRedirect(search.redirect);

  useEffect(() => {
    if (!loading && session) navigate({ to: target, replace: true });
  }, [loading, session, navigate, target]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-secondary/40 px-4 py-10">
      <Link to="/" className="flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <ScanLine className="size-5" />
        </span>
        <span className="font-display text-xl font-bold">SCANOVA-AI</span>
      </Link>

      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Welcome</CardTitle>
          <CardDescription>
            Government inspection workspace for packaged commodity compliance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
              <TabsTrigger value="forgot">Reset</TabsTrigger>
            </TabsList>
            <TabsContent value="signin" className="pt-4">
              <SignIn onDone={() => navigate({ to: target })} />
            </TabsContent>
            <TabsContent value="signup" className="pt-4">
              <SignUp />
            </TabsContent>
            <TabsContent value="forgot" className="pt-4">
              <Forgot />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      <p className="max-w-md text-center text-xs text-muted-foreground">
        Anyone can create a citizen account straight away. Inspector accounts are approved by a government
        authority administrator; company accounts are verified by an inspector. Supervisor and authority
        administrator accounts are issued by the authority and can only sign in.
      </p>
    </main>
  );
}

function friendly(message: string) {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "That email and password combination is not correct.";
  if (m.includes("email not confirmed"))
    return "Your email is not verified yet. Open the verification link we sent you, or resend it below.";
  if (m.includes("already registered")) return "An account already exists for this email. Try signing in.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Too many attempts. Please wait a minute and try again.";
  if (m.includes("password")) return message;
  return message || "Something went wrong. Please try again.";
}

function SignIn({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [unverified, setUnverified] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [demoBusy, setDemoBusy] = useState<string | null>(null);
  const prepare = useServerFn(ensureDemoAccounts);

  async function useDemo(account: (typeof DEMO_ACCOUNTS)[number]) {
    setDemoBusy(account.email);
    setEmail(account.email);
    setPassword(account.password);
    try {
      await prepare();
    } catch {
      /* the account may already exist — try signing in anyway */
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: account.email,
      password: account.password,
    });
    setDemoBusy(null);
    if (error) {
      toast.error(friendly(error.message));
      return;
    }
    toast.success(`Signed in as ${ROLE_LABELS[account.role]}`);
    onDone();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setUnverified(false);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      if (error.message.toLowerCase().includes("email not confirmed")) setUnverified(true);
      toast.error(friendly(error.message));
      return;
    }
    toast.success("Signed in");
    onDone();
  }

  async function resend() {
    if (!email.trim()) { toast.error("Enter your email first."); return; }
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth` },
    });
    if (error) toast.error(friendly(error.message));
    else toast.success("Verification email sent again. Check your inbox.");
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="si-email">Email</Label>
        <Input
          id="si-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="si-pass">Password</Label>
        <Input
          id="si-pass"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {unverified && (
        <Alert>
          <MailCheck className="size-4" />
          <AlertDescription className="flex flex-col items-start gap-2">
            Your email address has not been verified yet.
            <Button type="button" size="sm" variant="outline" onClick={resend}>
              Resend verification email
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
        Sign in
      </Button>

      <div className="rounded-md border border-dashed border-border p-3">
        <button
          type="button"
          onClick={() => setShowDemo((v) => !v)}
          className="flex w-full items-center justify-between text-sm font-medium"
        >
          <span className="flex items-center gap-2">
            <Users className="size-4" /> Demo logins
          </span>
          <span className="text-xs text-muted-foreground">{showDemo ? "Hide" : "Show"}</span>
        </button>
        {showDemo && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              One prepared account per role, including the authority administrator. Every record they hold is
              marked as demo data.
            </p>
            {DEMO_ACCOUNTS.map((a) => (
              <div
                key={a.email}
                className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 px-2.5 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{ROLE_LABELS[a.role]}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.email} · {a.password}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => useDemo(a)}
                  disabled={demoBusy !== null}
                >
                  {demoBusy === a.email && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                  Sign in
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </form>
  );
}

function SignUp() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>("inspector");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<null | { verify: boolean }>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { toast.error("Use a password of at least 8 characters."); return; }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth`,
        data: { full_name: fullName.trim(), requested_role: role },
      },
    });
    setBusy(false);
    if (error) { toast.error(friendly(error.message)); return; }
    // A session here means the project does not require email confirmation.
    setSent({ verify: !data.session });
    if (data.session) toast.success("Account created. You are signed in.");
  }

  if (sent)
    return (
      <Alert>
        <MailCheck className="size-4" />
        <AlertDescription>
          {sent.verify
            ? "Account created. We have sent a verification link to your email address — open it to activate your account, then sign in."
            : "Account created and signed in."}
        </AlertDescription>
      </Alert>
    );

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="su-name">Full name</Label>
        <Input id="su-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="su-email">Email</Label>
        <Input
          id="su-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="su-pass">Password</Label>
        <Input
          id="su-pass"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">At least 8 characters.</p>
      </div>
      <div className="space-y-2">
        <Label>I am a</Label>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SIGNUP_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
        Create account
      </Button>
    </form>
  );
}

function Forgot() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) { toast.error(friendly(error.message)); return; }
    setSent(true);
  }

  if (sent)
    return (
      <Alert>
        <MailCheck className="size-4" />
        <AlertDescription>
          If an account exists for that address, a password reset link is on its way. The link expires after
          a short time — request a new one if it stops working.
        </AlertDescription>
      </Alert>
    );

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="fp-email">Email</Label>
        <Input
          id="fp-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
        Send reset link
      </Button>
    </form>
  );
}
