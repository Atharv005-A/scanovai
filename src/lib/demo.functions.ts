/**
 * Ready-made demonstration accounts.
 *
 * Authority administrators and supervisors are never created by the public
 * sign-up form. For the prototype we provision a fixed, clearly-marked set of
 * demo accounts (including an authority administrator) so those screens can be
 * signed into. The passwords are intentionally public — these accounts only
 * ever hold demo data.
 */
import { createServerFn } from "@tanstack/react-start";

export interface DemoAccount {
  email: string;
  password: string;
  role: "authority_admin" | "supervisor" | "inspector" | "manufacturer" | "citizen";
  fullName: string;
  designation: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    email: "admin.demo@scanova.ai",
    password: "Scanova#2026",
    role: "authority_admin",
    fullName: "Demo Authority Administrator",
    designation: "Controller of Legal Metrology (demo)",
  },
  {
    email: "supervisor.demo@scanova.ai",
    password: "Scanova#2026",
    role: "supervisor",
    fullName: "Demo Supervisor",
    designation: "Assistant Controller (demo)",
  },
  {
    email: "inspector.demo@scanova.ai",
    password: "Scanova#2026",
    role: "inspector",
    fullName: "Demo Inspector",
    designation: "Legal Metrology Inspector (demo)",
  },
  {
    email: "company.demo@scanova.ai",
    password: "Scanova#2026",
    role: "manufacturer",
    fullName: "Demo Company Manager",
    designation: "Packer representative (demo)",
  },
  {
    email: "citizen.demo@scanova.ai",
    password: "Scanova#2026",
    role: "citizen",
    fullName: "Demo Citizen",
    designation: "Member of the public (demo)",
  },
];

const DEMO_AUTHORITY = {
  code: "LM-DEMO",
  name: "Legal Metrology Department (Demo Authority)",
  state: "Maharashtra",
};

/**
 * Creates (or repairs) the demo accounts. Safe to call repeatedly: existing
 * accounts keep their data, only the demo password and role wiring are ensured.
 */
export const ensureDemoAccounts = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Demo authority + office so staff accounts have something to be scoped to.
  let authorityId: string | null = null;
  let officeId: string | null = null;
  const { data: authority } = await supabaseAdmin
    .from("authorities")
    .select("id")
    .eq("code", DEMO_AUTHORITY.code)
    .maybeSingle();
  authorityId = (authority?.id as string | undefined) ?? null;
  if (!authorityId) {
    const { data: created } = await supabaseAdmin
      .from("authorities")
      .insert({ ...DEMO_AUTHORITY, is_demo: true })
      .select("id")
      .single();
    authorityId = (created?.id as string | undefined) ?? null;
  }
  if (authorityId) {
    const { data: office } = await supabaseAdmin
      .from("offices")
      .select("id")
      .eq("authority_id", authorityId)
      .limit(1)
      .maybeSingle();
    officeId = (office?.id as string | undefined) ?? null;
    if (!officeId) {
      const { data: created } = await supabaseAdmin
        .from("offices")
        .insert({
          authority_id: authorityId,
          name: "Pune District Office",
          district: "Pune",
          state: DEMO_AUTHORITY.state,
        })
        .select("id")
        .single();
      officeId = (created?.id as string | undefined) ?? null;
    }
  }

  let ready = 0;

  for (const account of DEMO_ACCOUNTS) {
    let userId: string | null = null;

    const created = await supabaseAdmin.auth.admin.createUser({
      email: account.email,
      password: account.password,
      email_confirm: true,
      user_metadata: { full_name: account.fullName, demo_account: true },
    });
    if (created.data?.user?.id) {
      userId = created.data.user.id;
    } else {
      // Already exists — find it and reset the demo password so the panel works.
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("email", account.email)
        .maybeSingle();
      userId = (profile?.id as string | undefined) ?? null;
      if (!userId) {
        const list = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
        userId =
          list.data?.users.find((u) => (u.email ?? "").toLowerCase() === account.email)?.id ?? null;
      }
      if (userId) {
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          password: account.password,
          email_confirm: true,
        });
      }
    }

    if (!userId) continue;

    await supabaseAdmin.from("profiles").upsert(
      {
        id: userId,
        email: account.email,
        full_name: account.fullName,
        designation: account.designation,
      },
      { onConflict: "id" },
    );

    // Demo accounts arrive with their role already granted, so no request queue.
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: account.role as never }, { onConflict: "user_id,role" });
    await supabaseAdmin
      .from("role_requests")
      .delete()
      .eq("user_id", userId)
      .eq("status", "pending");

    if (
      authorityId &&
      ["authority_admin", "supervisor", "inspector"].includes(account.role)
    ) {
      const { data: member } = await supabaseAdmin
        .from("authority_members")
        .select("id")
        .eq("user_id", userId)
        .eq("authority_id", authorityId)
        .maybeSingle();
      if (!member) {
        await supabaseAdmin.from("authority_members").insert({
          authority_id: authorityId,
          user_id: userId,
          office_id: officeId,
          member_role: account.role as never,
          is_active: true,
        });
      }
    }

    if (account.role === "manufacturer") {
      const { data: mfr } = await supabaseAdmin
        .from("manufacturers")
        .select("id")
        .eq("owner_id", userId)
        .maybeSingle();
      if (!mfr) {
        await supabaseAdmin.from("manufacturers").insert({
          owner_id: userId,
          name: "Sunrise Foods Pvt Ltd (demo)",
          city: "Pune",
          state: DEMO_AUTHORITY.state,
          country: "India",
          contact_email: account.email,
          is_demo: true,
          status: "active",
        });
      }
    }

    ready += 1;
  }

  return { ready };
});
