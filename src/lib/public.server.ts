/**
 * Server-only helpers for the public (no account required) surfaces.
 *
 * Public endpoints are rate limited and read through the publishable key, so
 * row-level security still applies exactly as it does for any anonymous
 * visitor. Privileged writes (recording a scan, storing evidence) go through
 * the service-role client only after validation, and never return government
 * data to the caller.
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Anonymous client: no session, publishable key, RLS as `anon`. */
export function publicSupabase() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`)
          headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

/** Best-effort caller identity for rate limiting. Never stored with the scan. */
export async function callerFingerprint() {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const forwarded = getRequestHeader("x-forwarded-for") ?? "";
  const ip =
    forwarded.split(",")[0]?.trim() ||
    getRequestHeader("cf-connecting-ip") ||
    getRequestHeader("x-real-ip") ||
    "unknown";
  return ip.slice(0, 64);
}

export interface RateLimitResult {
  allowed: boolean;
  message: string;
}

/**
 * Consumes one unit from a fixed window. Fails closed on an unexpected error so
 * a broken limiter cannot become an open door.
 */
export async function rateLimit(
  bucket: string,
  subject: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("consume_rate_limit", {
    _bucket: bucket,
    _subject: subject,
    _limit: limit,
    _window_seconds: windowSeconds,
  });
  if (error) {
    console.error("[rate-limit] failed", bucket, error);
    return { allowed: false, message: "This service is briefly unavailable. Try again in a minute." };
  }
  return {
    allowed: data === true,
    message:
      "You have made a lot of requests in a short time. Wait a few minutes before scanning again — this limit protects the public service.",
  };
}

export function randomToken(length = 14) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

const DATA_URL = /^data:image\/(png|jpe?g|webp);base64,/i;

/** Validates a browser-supplied image and returns raw base64 plus its bytes. */
export function decodeImage(input: string, maxBytes = 3_500_000) {
  const trimmed = input.trim();
  const base64 = DATA_URL.test(trimmed) ? trimmed.replace(DATA_URL, "") : trimmed;
  if (!/^[A-Za-z0-9+/=\s]+$/.test(base64.slice(0, 512)))
    throw new Error("That file is not a readable image.");
  const bytes = Math.floor((base64.length * 3) / 4);
  if (bytes > maxBytes)
    throw new Error("That image is too large. Retake it at a smaller size and try again.");
  return { base64: base64.replace(/\s+/g, ""), bytes };
}

export function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}
