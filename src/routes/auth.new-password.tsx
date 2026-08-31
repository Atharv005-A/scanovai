import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, ScanLine } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const Route = createFileRoute("/auth/new-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Choose a new password — SCANOVA-AI" },
      { name: "description", content: "Set a new password for your SCANOVA-AI account." },
      { property: "og:title", content: "Choose a new password — SCANOVA-AI" },
      { property: "og:description", content: "Complete your SCANOVA-AI password reset." },
    ],
  }),
  component: NewPassword,
});

function NewPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setReady(!!data.session));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { toast.error("Use a password of at least 8 characters."); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Password updated.");
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-secondary/40 px-4">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <ScanLine className="size-5" />
        </span>
        <span className="font-display text-xl font-bold">SCANOVA-AI</span>
      </div>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Choose a new password</CardTitle>
          <CardDescription>This completes your password reset.</CardDescription>
        </CardHeader>
        <CardContent>
          {ready === false ? (
            <Alert>
              <AlertDescription>
                This reset link is invalid or has expired. Request a new link from the sign-in page.
              </AlertDescription>
            </Alert>
          ) : ready === null ? (
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="np">New password</Label>
                <Input
                  id="np"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
                Update password
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
