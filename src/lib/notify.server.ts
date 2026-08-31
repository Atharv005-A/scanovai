/**
 * Notifications — server only.
 *
 * In-app notifications are real: they are rows the recipient reads in the bell
 * menu. E-mail delivery is only claimed when an e-mail provider is actually
 * configured for this deployment — otherwise the notification is stored with
 * `email_status = 'not_configured'` and the interface says so plainly rather
 * than pretending a message was sent.
 *
 * Writing a notification for another person needs privileged access (a citizen
 * may not write into an officer's inbox), so this module uses the service-role
 * client. It never reads or returns anything else with it.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type NotificationKind =
  | "review_requested"
  | "supervisor_decision"
  | "amendment_requested"
  | "amendment_decided"
  | "complaint_status"
  | "complaint_new"
  | "manufacturer_request"
  | "registry_review"
  | "registry_decision"
  | "batch_submitted"
  | "sync_failure"
  | "sync_complete"
  | "role_change"
  | "system";

export interface EmailStatus {
  configured: boolean;
  provider: string | null;
  message: string;
}

export function emailStatus(): EmailStatus {
  const key = process.env["RESEND_API_KEY"];
  const from = process.env["NOTIFICATION_FROM_EMAIL"];
  if (key && from)
    return {
      configured: true,
      provider: "resend",
      message: `Outbound e-mail is configured and sent from ${from}.`,
    };
  return {
    configured: false,
    provider: null,
    message:
      "No outbound e-mail provider is configured on this deployment, so notifications are delivered in-app only. Account e-mails (verification, password reset) are still sent by the authentication service.",
  };
}

async function sendEmail(to: string, subject: string, body: string) {
  const status = emailStatus();
  if (!status.configured) return { sent: false, status: "not_configured" as const, error: null };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env["RESEND_API_KEY"]}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env["NOTIFICATION_FROM_EMAIL"],
        to: [to],
        subject,
        text: body,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { sent: false, status: "failed" as const, error: text.slice(0, 300) };
    }
    return { sent: true, status: "sent" as const, error: null };
  } catch (e) {
    return { sent: false, status: "failed" as const, error: (e as Error).message.slice(0, 300) };
  }
}

export interface NotifyPayload {
  kind: NotificationKind;
  title: string;
  body?: string | null;
  link?: string | null;
  entity?: string | null;
  entityId?: string | null;
  /** Also try e-mail. Only attempted when a provider is configured. */
  email?: { to: string; subject?: string } | null;
}

export async function notify(userId: string, input: NotifyPayload) {
  let emailResult: { sent: boolean; status: string; error: string | null } = {
    sent: false,
    status: "not_requested",
    error: null,
  };
  if (input.email?.to) {
    emailResult = await sendEmail(
      input.email.to,
      input.email.subject ?? input.title,
      `${input.title}\n\n${input.body ?? ""}`.trim(),
    );
  }

  const { error } = await supabaseAdmin.from("notifications").insert({
    user_id: userId,
    kind: input.kind,
    title: input.title.slice(0, 200),
    body: input.body?.slice(0, 1200) ?? null,
    link: input.link ?? null,
    entity: input.entity ?? null,
    entity_id: input.entityId ?? null,
    channel: input.email?.to ? "email" : "in_app",
    email_status: input.email?.to ? emailResult.status : null,
    email_error: emailResult.error,
  });
  if (error) console.error("[notify] insert failed", error);
  return emailResult;
}

/** Notifies every active member of an authority holding one of `roles`. */
export async function notifyAuthorityStaff(
  authorityId: string | null,
  roles: string[],
  input: NotifyPayload,
) {
  if (!authorityId) return 0;
  const { data: members } = await supabaseAdmin
    .from("authority_members")
    .select("user_id, member_role")
    .eq("authority_id", authorityId)
    .eq("is_active", true);
  const targets = ((members ?? []) as { user_id: string; member_role: string }[]).filter((m) =>
    roles.includes(m.member_role),
  );
  for (const m of targets) await notify(m.user_id, input);
  return targets.length;
}

/** Notifies the owner of a manufacturer record, when there is one. */
export async function notifyManufacturerOwner(manufacturerId: string | null, input: NotifyPayload) {
  if (!manufacturerId) return false;
  const { data } = await supabaseAdmin
    .from("manufacturers")
    .select("owner_id")
    .eq("id", manufacturerId)
    .maybeSingle();
  const owner = (data?.owner_id as string | null) ?? null;
  if (!owner) return false;
  await notify(owner, input);
  return true;
}
