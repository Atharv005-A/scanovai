import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole =
  | "citizen"
  | "inspector"
  | "supervisor"
  | "manufacturer"
  | "authority_admin"
  | "system_admin";

interface Profile {
  id: string;
  full_name: string;
  email: string;
  designation: string | null;
  phone: string | null;
}

interface AuthValue {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: AppRole[];
  primaryRole: AppRole | null;
  isGovStaff: boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthValue>({
  loading: true,
  session: null,
  user: null,
  profile: null,
  roles: [],
  primaryRole: null,
  isGovStaff: false,
  refresh: async () => {},
});

const ROLE_PRIORITY: AppRole[] = [
  "system_admin",
  "authority_admin",
  "supervisor",
  "inspector",
  "manufacturer",
  "citizen",
];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (uid: string | null) => {
    if (!uid) {
      setProfile(null);
      setRoles([]);
      return;
    }
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, designation, phone").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
    ]);
    setProfile((p as Profile) ?? null);
    setRoles(((r ?? []) as { role: AppRole }[]).map((x) => x.role));
  }, []);

  useEffect(() => {
    let active = true;
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      setSession(next);
      if (event === "SIGNED_OUT") {
        setProfile(null);
        setRoles([]);
      }
    });
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await load(data.session?.user.id ?? null);
      setLoading(false);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [load]);

  const uid = session?.user.id ?? null;
  useEffect(() => {
    if (uid) void load(uid);
  }, [uid, load]);

  const value = useMemo<AuthValue>(() => {
    const primaryRole = ROLE_PRIORITY.find((r) => roles.includes(r)) ?? null;
    return {
      loading,
      session,
      user: session?.user ?? null,
      profile,
      roles,
      primaryRole,
      isGovStaff: roles.some((r) => ["inspector", "supervisor", "authority_admin", "system_admin"].includes(r)),
      refresh: async () => load(uid),
    };
  }, [loading, session, profile, roles, uid, load]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
