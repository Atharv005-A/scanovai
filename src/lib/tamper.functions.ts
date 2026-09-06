/**
 * Label tamper advisory — client-callable server function.
 *
 * This is an OPINION about the physical condition of the label, recorded as
 * evidence for the inspector. It never sets a compliance result: the
 * deterministic rule engine remains the only authority on the law.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Sb = {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, any>) => Promise<{ data: any; error: any }>;
  storage: any;
};

const uuid = z.string().uuid();

export const checkLabelTampering = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ inspectionId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Sb; userId: string };
    const { loadImages, signedUrlsFor } = await import("./pipeline.server");
    const { assessTampering } = await import("./ai.server");
    const { auditLog } = await import("./engine.server");

    // RLS decides whether this caller may see the inspection at all.
    const { data: insp, error } = await supabase
      .from("inspections")
      .select("id, status")
      .eq("id", data.inspectionId)
      .maybeSingle();
    if (error || !insp) throw new Error("That inspection is not available to you.");

    const images = await loadImages(supabase as any, data.inspectionId);
    if (images.length === 0)
      throw new Error("Add at least one package photograph before running the tamper check.");

    const urls = await signedUrlsFor(supabase as any, images, 900);
    const assessment = await assessTampering(urls.map((u) => ({ url: u.url, side: u.side })));

    await auditLog(
      supabase as any,
      userId,
      "inspection.tamper_checked",
      "inspection",
      data.inspectionId,
      { new_value: assessment as unknown as Record<string, unknown> },
    );

    return { assessment: assessment as unknown as Record<string, any> };
  });
