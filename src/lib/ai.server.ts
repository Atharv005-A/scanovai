/**
 * Server-only wrapper around the Lovable AI Gateway.
 *
 * IMPORTANT — the division of labour in SCANOVA-AI:
 *
 *   OCR (ocr.server.ts / ocr-client.ts)  reads the characters off the package.
 *   THIS MODULE                          maps that OCR text onto structured
 *                                        declaration fields and suggests a
 *                                        commodity category.
 *   rule-engine.ts                       decides compliance, deterministically.
 *
 * The model is never the OCR engine and is never asked what the law requires.
 * It may only quote text that already exists in the OCR output; every field it
 * returns must carry the exact OCR snippet it came from, which is verified in
 * code below. Snippets that do not appear in the OCR text are discarded.
 */

import { FIELD_DEFS, CATEGORIES } from "./domain";
import type { OcrBlock } from "./ocr.server";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
export const AI_MODEL = "google/gemini-3.7-flash";

export interface AiField {
  value: string | null;
  detected: boolean;
  confidence: number;
  side?: string | null;
  /** Verbatim fragment of the OCR text the value was taken from. */
  ocr_snippet?: string | null;
  /** True when the snippet was found in the OCR text. */
  grounded?: boolean;
}

export interface AiStructuring {
  category_guess: string | null;
  category_reason: string | null;
  anomalies: string[];
  fields: Record<string, AiField>;
  model: string;
  /** Fields dropped because their snippet was not present in the OCR text. */
  ungrounded: string[];
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

async function callGateway(
  content: Record<string, unknown>[],
  purpose: string,
): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new AiError("AI structuring is not configured on this deployment.", 401);

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
    let message = `${purpose} failed. You can retry, or enter the details manually.`;
    if (res.status === 402)
      message =
        "AI usage credits are exhausted for this workspace. Top them up to continue, or enter the details manually.";
    else if (res.status === 429) message = "The AI service is busy. Wait a few seconds and retry.";
    else if (res.status === 403) message = "AI access is blocked for this workspace by policy.";
    console.error("[ai] gateway error", res.status, body.slice(0, 500));
    throw new AiError(message, res.status);
  }

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content ?? "";
}

function extractJson(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normaliseForMatch(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Does the snippet actually occur in the OCR output? */
function isGrounded(snippet: string | null, haystack: string) {
  if (!snippet) return false;
  const needle = normaliseForMatch(snippet);
  if (needle.length < 3) return false;
  if (haystack.includes(needle)) return true;
  // Allow a small amount of OCR noise: 80% of 4+ char tokens must be present.
  const tokens = snippet
    .split(/\s+/)
    .map(normaliseForMatch)
    .filter((t) => t.length >= 4);
  if (tokens.length === 0) return false;
  const hits = tokens.filter((t) => haystack.includes(t)).length;
  return hits / tokens.length >= 0.8;
}

function structuringPrompt(ocrText: string, blocks: OcrBlock[]) {
  const fieldList = FIELD_DEFS.map((f) => `- ${f.key}: ${f.label} (${f.hint})`).join("\n");
  const cats = CATEGORIES.map((c) => `${c.value}`).join(", ");
  const blockSample = blocks
    .slice(0, 60)
    .map((b, i) => `[${i}|${b.side}] ${b.text.replace(/\n/g, " / ").slice(0, 160)}`)
    .join("\n");

  return `You are a data-structuring assistant for legal metrology inspectors in India.

An OCR engine has already read a packaged commodity. You are NOT the OCR engine.
Below is the OCR output. Your only job is to map that text onto structured fields.

HARD RULES
1. Use ONLY the OCR text below. Never add knowledge from anywhere else.
2. For every field you fill, copy the exact fragment of the OCR text you took it
   from into "ocr_snippet". If you cannot point at a fragment, the field must be
   null. Fields whose snippet is not found in the OCR text will be discarded.
3. You may tidy obvious OCR noise inside a value (spacing, "Rs" vs "₹", O/0
   confusion in a number) but you may not invent characters that are absent.
4. If a declaration is not present in the OCR text, set value=null and
   detected=false. A missing declaration is a legitimate, important finding.
5. "confidence" is how sure you are that this fragment really is that field and
   was read correctly (0..1). Use < 0.6 when the OCR text is garbled or the
   mapping is ambiguous.
6. Never say anything about legality, rules, offences or compliance.

FIELDS
${fieldList}

CATEGORY
Suggest the single most likely commodity category from this list, or null:
${cats}
Give a one-sentence reason based only on the OCR text.

ANOMALIES
List short, factual observations that a human should look at (for example
"two different net quantities appear in the text", "MRP appears twice with
different amounts", "text appears to be cut off"). Empty array if none.

OCR TEXT
"""
${ocrText.slice(0, 14000)}
"""

OCR BLOCKS (index|side)
${blockSample}

Reply with STRICT JSON only, no markdown fence, exactly:
{"category_guess":"...|null","category_reason":"...","anomalies":["..."],"fields":{"<field_key>":{"value":"...|null","detected":true,"confidence":0.0,"side":"front|back|side|top_bottom|declaration|null","ocr_snippet":"exact fragment from OCR text|null"}}}`;
}

/**
 * Maps OCR output onto declaration fields. Optional image URLs are passed so
 * the model can resolve layout ambiguity (which panel a value sits on); the
 * values themselves still have to be grounded in the OCR text.
 */
export async function structureFromOcr(input: {
  ocrText: string;
  blocks: OcrBlock[];
  imageUrls?: { url: string; side: string }[];
}): Promise<AiStructuring> {
  if (!input.ocrText.trim())
    throw new AiError("There is no OCR text to structure. Read the package first.");

  const content: Record<string, unknown>[] = [
    { type: "text", text: structuringPrompt(input.ocrText, input.blocks) },
  ];
  for (const img of (input.imageUrls ?? []).slice(0, 4)) {
    content.push({ type: "text", text: `Layout reference — ${img.side}:` });
    content.push({ type: "image_url", image_url: { url: img.url } });
  }

  const text = await callGateway(content, "Reading the declarations");
  const obj = extractJson(text) as
    | (Partial<AiStructuring> & { fields?: Record<string, AiField> })
    | null;
  if (!obj) {
    console.error("[ai] unparseable structuring response", text.slice(0, 500));
    throw new AiError("We couldn't organise the label text. Please retry or enter it manually.");
  }

  const haystack = normaliseForMatch(input.ocrText);
  const fields: Record<string, AiField> = {};
  const ungrounded: string[] = [];

  for (const def of FIELD_DEFS) {
    const f = obj.fields?.[def.key];
    const rawValue = typeof f?.value === "string" && f.value.trim() !== "" ? f.value.trim() : null;
    const snippet =
      typeof f?.ocr_snippet === "string" && f.ocr_snippet.trim() !== "" ? f.ocr_snippet.trim() : null;
    const confidence = typeof f?.confidence === "number" ? Math.max(0, Math.min(1, f.confidence)) : 0;

    // A value must be traceable to the OCR text, either through its snippet or
    // by appearing verbatim itself. Otherwise it is dropped as unsupported.
    const grounded = rawValue != null && (isGrounded(snippet, haystack) || isGrounded(rawValue, haystack));
    if (rawValue != null && !grounded) ungrounded.push(def.key);

    fields[def.key] = {
      value: grounded ? rawValue : null,
      detected: grounded,
      confidence: grounded ? confidence : 0,
      side: typeof f?.side === "string" ? f.side : null,
      ocr_snippet: grounded ? (snippet ?? rawValue) : null,
      grounded,
    };
  }

  const categoryValues = new Set(CATEGORIES.map((c) => c.value));
  const guess =
    typeof obj.category_guess === "string" && categoryValues.has(obj.category_guess)
      ? obj.category_guess
      : null;

  return {
    category_guess: guess,
    category_reason: typeof obj.category_reason === "string" ? obj.category_reason.slice(0, 400) : null,
    anomalies: Array.isArray(obj.anomalies)
      ? obj.anomalies.filter((a): a is string => typeof a === "string").slice(0, 8).map((a) => a.slice(0, 240))
      : [],
    fields,
    model: AI_MODEL,
    ungrounded,
  };
}

// ---------------------------------------------------------------------------
// Complaint triage assistance. Advisory only — AI never closes a complaint.
// ---------------------------------------------------------------------------

export interface ComplaintTriage {
  suggested_category: string | null;
  suggested_priority: "low" | "normal" | "high";
  evidence_quality: "good" | "limited" | "poor";
  summary: string;
  suspected_issues: string[];
  model: string;
}

export async function triageComplaint(input: {
  productName: string;
  manufacturer: string | null;
  description: string;
  hasImage: boolean;
}): Promise<ComplaintTriage> {
  const cats = CATEGORIES.map((c) => c.value).join(", ");
  const prompt = `You are triaging a consumer complaint about a packaged commodity label in India.

You must NOT decide whether any law was broken, and you must NOT close or reject
the complaint. You only summarise and suggest a priority so a human officer can
pick it up faster.

Complaint
- product: ${input.productName}
- manufacturer as reported: ${input.manufacturer ?? "not given"}
- photo evidence attached: ${input.hasImage ? "yes" : "no"}
- description: """${input.description.slice(0, 2000)}"""

Choose the most likely commodity category from: ${cats}
Choose priority: low | normal | high (high only when the description reports a
missing or wrong price/quantity declaration, or a safety-relevant omission).
Judge evidence quality: good | limited | poor.
List the specific label issues the complainant appears to describe, in the
complainant's own terms, without legal conclusions.

Reply with STRICT JSON only:
{"suggested_category":"...|null","suggested_priority":"normal","evidence_quality":"limited","summary":"one or two sentences","suspected_issues":["..."]}`;

  const text = await callGateway([{ type: "text", text: prompt }], "Complaint triage");
  const obj = extractJson(text) as Partial<ComplaintTriage> | null;
  const categoryValues = new Set(CATEGORIES.map((c) => c.value));
  const priority = obj?.suggested_priority;
  const quality = obj?.evidence_quality;
  return {
    suggested_category:
      typeof obj?.suggested_category === "string" && categoryValues.has(obj.suggested_category)
        ? obj.suggested_category
        : null,
    suggested_priority: priority === "low" || priority === "high" ? priority : "normal",
    evidence_quality: quality === "good" || quality === "poor" ? quality : "limited",
    summary: typeof obj?.summary === "string" ? obj.summary.slice(0, 600) : "",
    suspected_issues: Array.isArray(obj?.suspected_issues)
      ? obj.suspected_issues.filter((s): s is string => typeof s === "string").slice(0, 6)
      : [],
    model: AI_MODEL,
  };
}

/* ------------------------------------------------------------------ *
 * Label tamper advisory
 *
 * Visual-integrity opinion only. It never decides compliance: the
 * deterministic rule engine owns that. A suspicion here tells the
 * inspector to look closer, nothing more.
 * ------------------------------------------------------------------ */

export interface TamperFinding {
  side: string | null;
  observation: string;
}

export interface TamperAssessment {
  verdict: "no_signs" | "possible_tampering" | "insufficient_evidence";
  confidence: number;
  findings: TamperFinding[];
  summary: string;
  model: string;
}

const TAMPER_PROMPT = `You are assisting a Legal Metrology field inspector with a VISUAL INTEGRITY
check of a packaged commodity label. You do NOT judge legal compliance.

Look only for physical/printing signs that the label or its declarations may
have been altered after packing, for example:
- a sticker or overprint placed over the MRP, net quantity or dates
- two conflicting printed values visible in the same panel
- scratched, scraped, smudged or inked-over characters
- mismatched fonts, sizes, alignment or ink colour within one declaration
- a torn, re-glued or peeled label edge, or a label that does not fit the panel

Report ONLY what is visible in the photographs. Do not speculate about intent.
If the photos are too blurry, dark or partial to judge, say so.

Reply with STRICT JSON only, no markdown fence, exactly:
{"verdict":"no_signs|possible_tampering|insufficient_evidence","confidence":0.0,
"summary":"one or two plain sentences","findings":[{"side":"front|back|side|top_bottom|declaration|null","observation":"..."}]}`;

export async function assessTampering(
  imageUrls: { url: string; side: string }[],
): Promise<TamperAssessment> {
  if (imageUrls.length === 0)
    throw new AiError("There are no package photographs to examine yet.");

  const content: Record<string, unknown>[] = [{ type: "text", text: TAMPER_PROMPT }];
  for (const img of imageUrls.slice(0, 5)) {
    content.push({ type: "text", text: `Photograph — ${img.side}:` });
    content.push({ type: "image_url", image_url: { url: img.url } });
  }

  const text = await callGateway(content, "Checking the label for tampering");
  const obj = extractJson(text) as Partial<TamperAssessment> | null;
  if (!obj) throw new AiError("The tamper check returned an unreadable answer. Retry.");

  const verdict =
    obj.verdict === "possible_tampering" || obj.verdict === "no_signs"
      ? obj.verdict
      : "insufficient_evidence";
  const findings = Array.isArray(obj.findings)
    ? obj.findings
        .filter((f) => f && typeof f.observation === "string" && f.observation.trim())
        .slice(0, 8)
        .map((f) => ({ side: f.side ?? null, observation: String(f.observation).slice(0, 400) }))
    : [];

  return {
    verdict,
    confidence: Math.max(0, Math.min(1, Number(obj.confidence) || 0)),
    findings,
    summary: typeof obj.summary === "string" ? obj.summary.slice(0, 600) : "",
    model: AI_MODEL,
  };
}
