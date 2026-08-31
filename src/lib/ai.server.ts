/**
 * Server-only wrapper around the Lovable AI Gateway.
 *
 * The model is used ONLY to read what is printed on the package (OCR +
 * structuring) and to estimate its own reading confidence. It is never asked
 * what the law requires — that is decided by the deterministic rule engine
 * from rules stored in the database and derived from the official PDF.
 */

import { FIELD_DEFS, CATEGORIES } from "./domain";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
export const AI_MODEL = "google/gemini-3.7-flash";

export interface AiField {
  value: string | null;
  detected: boolean;
  confidence: number;
  side?: string | null;
}

export interface AiExtraction {
  raw_text: string;
  category_guess: string | null;
  image_quality: { usable: boolean; note: string };
  fields: Record<string, AiField>;
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

function buildPrompt() {
  const fieldList = FIELD_DEFS.map((f) => `- ${f.key}: ${f.label} (${f.hint})`).join("\n");
  const cats = CATEGORIES.map((c) => c.value).join(", ");
  return `You are a label-reading assistant for legal metrology inspectors in India.

You will receive photographs of ONE packaged commodity (possibly several sides).

Your job is strictly limited to reading the package:
1. Transcribe all legible text you can see (raw_text).
2. Fill the structured fields below using ONLY text that is actually visible.
3. Never guess, never complete a value from general knowledge, never translate a
   missing declaration into a plausible one. If a declaration is not visible, set
   detected=false and value=null.
4. Give an honest confidence between 0 and 1 for each field (how sure you are that
   you read the printed characters correctly). Use a low value (<0.6) when the text
   is blurred, cropped, angled or partially hidden.
5. Judge overall image usability: if the photos are too blurry / dark / low
   resolution to read declarations, set image_quality.usable=false.
6. Do NOT decide anything about legal compliance. Do not mention rules.

Fields to extract:
${fieldList}

Also suggest the most likely commodity category from this list (or null):
${cats}

Reply with STRICT JSON only, no markdown fence, in exactly this shape:
{"raw_text":"...","category_guess":"...|null","image_quality":{"usable":true,"note":"short plain-language note"},"fields":{"<field_key>":{"value":"...|null","detected":true,"confidence":0.0,"side":"front|back|side|top_bottom|declaration|null"}}}`;
}

export async function extractFromImages(
  images: { url: string; side: string }[],
): Promise<{ extraction: AiExtraction; model: string }> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new AiError("AI extraction is not configured on the server.", 401);

  const content: Record<string, unknown>[] = [
    {
      type: "text",
      text: `${buildPrompt()}\n\nThe images are labelled in order: ${images
        .map((i, idx) => `#${idx + 1} = ${i.side}`)
        .join(", ")}.`,
    },
    ...images.map((i) => ({ type: "image_url", image_url: { url: i.url } })),
  ];

  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [{ role: "user", content }],
      temperature: 0,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    let message = "Label extraction failed. You can retry or enter the details manually.";
    if (res.status === 402)
      message = "AI usage credits are exhausted for this workspace. Add credits in Lovable to continue, or enter the details manually.";
    else if (res.status === 429) message = "The AI service is busy. Wait a few seconds and retry.";
    else if (res.status === 403) message = "AI access is blocked for this workspace by policy.";
    console.error("[ai] gateway error", res.status, body.slice(0, 500));
    throw new AiError(message, res.status);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = json.choices?.[0]?.message?.content ?? "";
  const parsed = safeParse(text);
  if (!parsed) {
    console.error("[ai] unparseable response", text.slice(0, 500));
    throw new AiError("We couldn't process the label information. Please retry or enter it manually.");
  }
  return { extraction: parsed, model: AI_MODEL };
}

function safeParse(text: string): AiExtraction | null {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1)) as Partial<AiExtraction>;
    const fields: Record<string, AiField> = {};
    for (const def of FIELD_DEFS) {
      const f = (obj.fields ?? {})[def.key] as AiField | undefined;
      const value = typeof f?.value === "string" && f.value.trim() !== "" ? f.value.trim() : null;
      const confidence = typeof f?.confidence === "number" ? Math.max(0, Math.min(1, f.confidence)) : 0;
      fields[def.key] = {
        value,
        detected: value != null && f?.detected !== false,
        confidence: value == null ? 0 : confidence,
        side: typeof f?.side === "string" ? f.side : null,
      };
    }
    return {
      raw_text: typeof obj.raw_text === "string" ? obj.raw_text : "",
      category_guess: typeof obj.category_guess === "string" ? obj.category_guess : null,
      image_quality: {
        usable: obj.image_quality?.usable !== false,
        note: typeof obj.image_quality?.note === "string" ? obj.image_quality.note : "",
      },
      fields,
    };
  } catch {
    return null;
  }
}
