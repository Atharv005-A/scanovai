/**
 * Role provisioning and authority administration.
 *
 * Privileged roles are never self-assigned. Every path here ends in a
 * security-definer database function (`grant_role`, `revoke_role`,
 * `redeem_role_invitation`) that re-checks the caller's own roles in the
 * database, so a tampered client cannot escalate itself.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Sb = {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, any>) => Promise<{ data: any; error: any }>;
};

const uuid = z.string().uuid();
const GRANTABLE = ["inspector", "supervisor", "authority_admin", "manufacturer", "retailer", "system_admin"] as const;
const REQUESTABLE = ["inspector", "supervisor", "manufacturer", "retailer", "authority_admin"] as const;

async function rolesOf(supabase: Sb, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return ((data ?? []) as { role: string }[]).map((r) => r.role);
}

/** Everything the shell needs to decide what this account may see. */
export const myAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };

    const [{ data: roleRows }, { data: membership }, { data: manufacturer }, { data: requests }] =
      await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase
          .from("authority_members")
          .select("authority_id, office_id, member_role, is_active, authorities(name, code, state)")
          .eq("user_id", userId)
          .eq("is_active", true)
          .maybeSingle(),
        supabase
          .from("manufacturers")
          .select("id, name, status")
          .eq("owner_id", userId)
          .order("created_at")
          .limit(1)
          .maybeSingle(),
        supabase
          .from("role_requests")
          .select("id, requested_role, status, created_at, decided_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
      ]);

    const roles = ((roleRows ?? []) as { role: string }[]).map((r) => r.role);
    const authority = membership
      ? {
          id: membership.authority_id as string,
          office_id: (membership.office_id as string | null) ?? null,
          member_role: membership.member_role as string,
          name: (membership.authorities?.name as string | undefined) ?? null,
          code: (membership.authorities?.code as string | undefined) ?? null,
          state: (membership.authorities?.state as string | undefined) ?? null,
        }
      : null;

    return {
      userId,
      roles,
      authority,
      manufacturer: manufacturer ?? null,
      requests: (requests ?? []) as Record<string, any>[],
      isStaff: roles.some((r) =>
        ["inspector", "supervisor", "authority_admin", "system_admin"].includes(r),
      ),
      isAdmin: roles.some((r) => ["authority_admin", "system_admin"].includes(r)),
    };
  });

/** Administrators mint single-use codes; holders redeem them to gain a role. */
export const createRoleInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        role: z.enum(GRANTABLE),
        email: z.string().trim().email().max(160).nullable().optional(),
        note: z.string().trim().max(300).nullable().optional(),
        maxUses: z.number().int().min(1).max(50).default(1),
        authorityId: uuid.nullable().optional(),
        officeId: uuid.nullable().optional(),
        expiresInDays: z.number().int().min(1).max(365).default(30),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { randomToken } = await import("./public.server");
    const { auditLog } = await import("./engine.server");

    const roles = await rolesOf(supabase, userId);
    const isSystem = roles.includes("system_admin");
    const isAuthorityAdmin = roles.includes("authority_admin");
    if (!isSystem && !isAuthorityAdmin) throw new Error("Administrator role required.");
    if (!isSystem && !["inspector", "supervisor", "authority_admin"].includes(data.role))
      throw new Error("An authority administrator may only invite inspectors, supervisors or administrators.");

    let authorityId = data.authorityId ?? null;
    if (!isSystem) {
      const { data: mine } = await supabase.rpc("my_authority_id");
      authorityId = (mine as string | null) ?? null;
      if (!authorityId) throw new Error("Your account is not attached to an authority.");
    }

    const code = `SC-${randomToken(4)}-${randomToken(4)}`;
    const { data: invite, error } = await supabase
      .from("role_invitations")
      .insert({
        code,
        email: data.email ?? null,
        role: data.role,
        authority_id: authorityId,
        office_id: data.officeId ?? null,
        note: data.note ?? null,
        max_uses: data.maxUses,
        created_by: userId,
        expires_at: new Date(Date.now() + data.expiresInDays * 86_400_000).toISOString(),
      })
      .select("id, code, role, email, max_uses, uses, expires_at, note, authority_id")
      .single();
    if (error || !invite) throw new Error("The invitation could not be created.");

    await auditLog(supabase as never, userId, "role_invitation.created", "role_invitation", invite.id as string, {
      new_value: { role: data.role, email: data.email ?? null, max_uses: data.maxUses },
    });
    return { invitation: invite };
  });

export const listRoleInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as unknown as { supabase: Sb };
    const { data } = await supabase
      .from("role_invitations")
      .select("id, code, role, email, note, max_uses, uses, is_active, expires_at, created_at, authority_id")
      .order("created_at", { ascending: false })
      .limit(100);
    return { invitations: (data ?? []) as Record<string, any>[] };
  });

export const deactivateRoleInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ invitationId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { auditLog } = await import("./engine.server");
    const { data: updated, error } = await supabase
      .from("role_invitations")
      .update({ is_active: false })
      .eq("id", data.invitationId)
      .select("id");
    if (error || !updated || updated.length === 0)
      throw new Error("The invitation could not be deactivated.");
    await auditLog(
      supabase as never,
      userId,
      "role_invitation.deactivated",
      "role_invitation",
      data.invitationId,
      {},
    );
    return { ok: true as const };
  });

const REDEEM_MESSAGES: Record<string, string> = {
  not_signed_in: "Sign in first, then redeem your invitation code.",
  rate_limited: "Too many attempts. Wait a few minutes and try again.",
  invalid: "That code is not valid, has expired, or has already been used.",
};

export const redeemRoleInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ code: z.string().trim().min(4).max(40) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as unknown as { supabase: Sb };
    const { data: result, error } = await supabase.rpc("redeem_role_invitation", { _code: data.code });
    if (error) throw new Error("The invitation could not be redeemed.");
    const payload = (result ?? {}) as { ok?: boolean; reason?: string; role?: string };
    if (!payload.ok)
      throw new Error(REDEEM_MESSAGES[payload.reason ?? "invalid"] ?? "That code could not be redeemed.");
    return { ok: true as const, role: payload.role ?? null };
  });

/** A signed-in user may ask for a privileged role; an administrator decides. */
export const requestRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        role: z.enum(REQUESTABLE),
        justification: z.string().trim().min(10).max(1000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { notifyAuthorityStaff } = await import("./notify.server");

    const existing = await supabase
      .from("role_requests")
      .select("id, status")
      .eq("user_id", userId)
      .eq("requested_role", data.role)
      .maybeSingle();
    if (existing.data && existing.data.status === "pending")
      return { ok: true as const, alreadyPending: true as const };
    if (existing.data) {
      const { error } = await supabase
        .from("role_requests")
        .update({ justification: data.justification, status: "pending", decided_by: null, decided_at: null })
        .eq("id", existing.data.id);
      if (error) throw new Error("The request could not be updated.");
    } else {
      const { error } = await supabase
        .from("role_requests")
        .insert({ user_id: userId, requested_role: data.role, justification: data.justification });
      if (error) throw new Error("The request could not be submitted.");
    }

    const { data: authorities } = await supabase.from("authorities").select("id").limit(5);
    for (const a of ((authorities ?? []) as { id: string }[]).slice(0, 5)) {
      await notifyAuthorityStaff(a.id, ["authority_admin"], {
        kind: "role_request",
        title: `Access request — ${data.role.replace("_", " ")}`,
        body: data.justification.slice(0, 300),
        link: "/admin",
        entity: "role_request",
      });
    }
    return { ok: true as const, alreadyPending: false as const };
  });

/**
 * Approval queue. Authority administrators see every request; an inspector
 * sees only company/retail applications, which they are allowed to verify.
 */
export const listRoleRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const roles = await rolesOf(supabase, userId);
    const isAdmin = roles.some((r) => ["authority_admin", "system_admin"].includes(r));
    const isInspector = roles.includes("inspector");
    if (!isAdmin && !isInspector) return { requests: [] as Record<string, any>[] };

    let query = supabase
      .from("role_requests")
      .select("id, user_id, requested_role, justification, status, created_at, decided_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (!isAdmin) query = query.in("requested_role", ["manufacturer", "retailer"]);
    const { data: requests } = await query;

    const ids = [...new Set(((requests ?? []) as { user_id: string }[]).map((r) => r.user_id))];
    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("id, full_name, email").in("id", ids)
      : { data: [] };
    const byId = new Map(
      ((profiles ?? []) as { id: string; full_name: string; email: string }[]).map((p) => [p.id, p]),
    );

    return {
      requests: ((requests ?? []) as Record<string, any>[]).map((r) => ({
        ...r,
        profile: byId.get(r["user_id"] as string) ?? null,
      })),
    };
  });

export const decideRoleRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        requestId: uuid,
        approve: z.boolean(),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { notify } = await import("./notify.server");
    const { auditLog } = await import("./engine.server");

    const { data: request, error } = await supabase
      .from("role_requests")
      .select("id, user_id, requested_role, status")
      .eq("id", data.requestId)
      .maybeSingle();
    if (error || !request) throw new Error("That request could not be found.");
    if (request.status !== "pending") throw new Error("That request has already been decided.");

    if (data.approve) {
      const { error: rpcError } = await supabase.rpc("grant_role", {
        _user_id: request.user_id,
        _role: request.requested_role,
        _reason: data.reason ?? "Approved access request",
      });
      if (rpcError) throw new Error(rpcError.message ?? "The role could not be granted.");
    } else {
      const { error: updateError } = await supabase
        .from("role_requests")
        .update({ status: "rejected", decided_by: userId, decided_at: new Date().toISOString() })
        .eq("id", data.requestId);
      if (updateError) throw new Error("The decision could not be recorded.");
      await auditLog(supabase as never, userId, "role_request.rejected", "role_request", data.requestId, {
        previous_value: { role: request.requested_role },
        ...(data.reason ? { reason: data.reason } : {}),
      });
    }

    await notify(request.user_id as string, {
      kind: "role_decision",
      title: data.approve
        ? `Access approved — ${String(request.requested_role).replace("_", " ")}`
        : `Access request declined`,
      body: data.approve
        ? "Your account now has the requested role. Sign out and back in if a screen looks unchanged."
        : (data.reason ?? "An administrator declined the request."),
      link: "/dashboard",
      entity: "role_request",
      entityId: data.requestId,
    });

    return { ok: true as const };
  });

/** Directory search so an administrator can grant a role to an existing account. */
export const findAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ query: z.string().trim().min(3).max(160) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const roles = await rolesOf(supabase, userId);
    if (!roles.some((r) => ["authority_admin", "system_admin"].includes(r)))
      throw new Error("Administrator role required.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const term = `%${data.query.replace(/[%_]/g, "")}%`;
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, designation")
      .or(`email.ilike.${term},full_name.ilike.${term}`)
      .limit(20);

    const ids = ((profiles ?? []) as { id: string }[]).map((p) => p.id);
    const { data: roleRows } = ids.length
      ? await supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids)
      : { data: [] };
    const grouped = new Map<string, string[]>();
    for (const r of (roleRows ?? []) as { user_id: string; role: string }[]) {
      grouped.set(r.user_id, [...(grouped.get(r.user_id) ?? []), r.role]);
    }

    return {
      accounts: ((profiles ?? []) as Record<string, any>[]).map((p) => ({
        id: p["id"] as string,
        full_name: p["full_name"] as string,
        email: p["email"] as string,
        designation: (p["designation"] as string | null) ?? null,
        roles: grouped.get(p["id"] as string) ?? [],
      })),
    };
  });

export const grantRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ userId: uuid, role: z.enum(GRANTABLE), reason: z.string().trim().max(500).optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as unknown as { supabase: Sb };
    const { notify } = await import("./notify.server");
    const { error } = await supabase.rpc("grant_role", {
      _user_id: data.userId,
      _role: data.role,
      _reason: data.reason ?? null,
    });
    if (error) throw new Error(error.message ?? "The role could not be granted.");
    await notify(data.userId, {
      kind: "role_decision",
      title: `Role granted — ${data.role.replace("_", " ")}`,
      body: data.reason ?? "An administrator granted you this role.",
      link: "/dashboard",
      entity: "user_roles",
      entityId: data.userId,
    });
    return { ok: true as const };
  });

export const revokeRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ userId: uuid, role: z.enum(GRANTABLE), reason: z.string().trim().max(500).optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as unknown as { supabase: Sb };
    const { notify } = await import("./notify.server");
    const { error } = await supabase.rpc("revoke_role", {
      _user_id: data.userId,
      _role: data.role,
      _reason: data.reason ?? null,
    });
    if (error) throw new Error(error.message ?? "The role could not be revoked.");
    await notify(data.userId, {
      kind: "role_decision",
      title: `Role withdrawn — ${data.role.replace("_", " ")}`,
      body: data.reason ?? "An administrator withdrew this role.",
      link: "/dashboard",
      entity: "user_roles",
      entityId: data.userId,
    });
    return { ok: true as const };
  });

/** Authority roster — who holds which role inside the caller's authority. */
export const authorityRoster = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as unknown as { supabase: Sb };
    const { data: members } = await supabase
      .from("authority_members")
      .select("id, user_id, authority_id, office_id, member_role, is_active, created_at")
      .order("created_at", { ascending: false })
      .limit(300);

    const ids = [...new Set(((members ?? []) as { user_id: string }[]).map((m) => m.user_id))];
    const [{ data: profiles }, { data: offices }] = await Promise.all([
      ids.length
        ? supabase.from("profiles").select("id, full_name, email, designation").in("id", ids)
        : Promise.resolve({ data: [] as unknown[] }),
      supabase.from("offices").select("id, name, district, state"),
    ]);
    const byId = new Map(((profiles ?? []) as { id: string }[]).map((p) => [p.id, p]));
    const officeById = new Map(((offices ?? []) as { id: string }[]).map((o) => [o.id, o]));

    return {
      members: ((members ?? []) as Record<string, any>[]).map((m) => ({
        ...m,
        profile: byId.get(m["user_id"] as string) ?? null,
        office: m["office_id"] ? (officeById.get(m["office_id"] as string) ?? null) : null,
      })),
    };
  });
