/**
 * Server-only OCR abstraction.
 *
 * This module is the ONLY place that talks to an optical-character-recognition
 * engine. The primary provider is Google Cloud Vision
 * (`DOCUMENT_TEXT_DETECTION`), called from the server so the credential never
 * reaches the browser. A second, genuinely different engine (Tesseract running
 * on the user's device) is handled by `ocr-client.ts` and ingested through
 * `ingestDeviceOcr`.
 *
 * Nothing here invents text. If no OCR provider is configured the caller gets
 * `status: "not_configured"` and the UI must say so and offer manual entry —
 * an AI vision model is never presented as the OCR engine.
 */

export type OcrProviderId = "google_vision" | "lovable_ai_vision" | "tesseract_browser";

export interface OcrProviderInfo {
  id: OcrProviderId;
  label: string;
  shortLabel: string;
  runsOn: "server" | "device";
  description: string;
}

export const OCR_PROVIDERS: Record<OcrProviderId, OcrProviderInfo> = {
  google_vision: {
    id: "google_vision",
    label: "Google Cloud Vision — DOCUMENT_TEXT_DETECTION",
    shortLabel: "Google Cloud Vision",
    runsOn: "server",
    description:
      "Dense document text detection performed on the server. Returns per-block text with bounding boxes and per-word confidence.",
  },
  lovable_ai_vision: {
    id: "lovable_ai_vision",
    label: "Built-in vision transcription (server)",
    shortLabel: "Built-in reader",
    runsOn: "server",
    description:
      "A vision model transcribes the printed text on the package, verbatim and line by line, on the server. It is used only to read characters — never to decide what the law requires.",
  },
  tesseract_browser: {
    id: "tesseract_browser",
    label: "Tesseract OCR — on-device (WebAssembly)",
    shortLabel: "Tesseract (on-device)",
    runsOn: "device",
    description:
      "The open-source Tesseract engine compiled to WebAssembly, running inside this device's browser. No image leaves the device for the reading step.",
  },
};


export interface OcrBlock {
  text: string;
  confidence: number;
  /** Normalised 0..1 box relative to the source image. */
  bbox: { x0: number; y0: number; x1: number; y1: number };
  side: string;
  imageIndex: number;
}

export type OcrRunStatus = "succeeded" | "failed" | "not_configured";

export interface OcrOutcome {
  provider: OcrProviderId;
  providerLabel: string;
  model: string | null;
  status: OcrRunStatus;
  rawText: string;
  blocks: OcrBlock[];
  meanConfidence: number | null;
  wordCount: number;
  durationMs: number;
  error: string | null;
}

export class OcrError extends Error {
  constructor(
    message: string,
    readonly status: OcrRunStatus = "failed",
  ) {
    super(message);
  }
}

const VISION_ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";

/** Reads the Vision credential. Must only be called inside a request handler. */
export function googleVisionKey(): string | null {
  const key =
    process.env["GOOGLE_CLOUD_VISION_API_KEY"] ??
    process.env["GOOGLE_VISION_API_KEY"] ??
    null;
  return key && key.trim() !== "" ? key.trim() : null;
}

export interface OcrConfigStatus {
  primary: OcrProviderInfo;
  primaryConfigured: boolean;
  fallback: OcrProviderInfo;
  /** Plain-language message for the interface. */
  message: string;
  secretName: string;
}

export function ocrConfigStatus(): OcrConfigStatus {
  const configured = googleVisionKey() != null;
  return {
    primary: OCR_PROVIDERS.google_vision,
    primaryConfigured: configured,
    fallback: OCR_PROVIDERS.tesseract_browser,
    secretName: "GOOGLE_CLOUD_VISION_API_KEY",
    message: configured
      ? "Google Cloud Vision is configured. Package images are read on the server with DOCUMENT_TEXT_DETECTION."
      : "Google Cloud Vision is not configured on this deployment, so the server-side reader is unavailable. Reading falls back to the Tesseract engine running on this device, and manual entry is always available.",
  };
}

interface VisionVertex {
  x?: number;
  y?: number;
}
interface VisionWord {
  symbols?: { text?: string }[];
  confidence?: number;
  boundingBox?: { vertices?: VisionVertex[]; normalizedVertices?: VisionVertex[] };
}
interface VisionParagraph {
  words?: VisionWord[];
  confidence?: number;
}
interface VisionBlock {
  paragraphs?: VisionParagraph[];
  confidence?: number;
  boundingBox?: { vertices?: VisionVertex[]; normalizedVertices?: VisionVertex[] };
}
interface VisionPage {
  width?: number;
  height?: number;
  blocks?: VisionBlock[];
}
interface VisionResponse {
  fullTextAnnotation?: { text?: string; pages?: VisionPage[] };
  error?: { message?: string; code?: number };
}

function boxFrom(
  poly: { vertices?: VisionVertex[]; normalizedVertices?: VisionVertex[] } | undefined,
  pageW: number,
  pageH: number,
) {
  const normalized = poly?.normalizedVertices;
  const raw = poly?.vertices;
  const pts = (normalized?.length ? normalized : raw) ?? [];
  if (pts.length === 0) return { x0: 0, y0: 0, x1: 0, y1: 0 };
  const useNormalized = !!normalized?.length;
  const xs = pts.map((p) => (p.x ?? 0) / (useNormalized ? 1 : Math.max(pageW, 1)));
  const ys = pts.map((p) => (p.y ?? 0) / (useNormalized ? 1 : Math.max(pageH, 1)));
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  return {
    x0: clamp(Math.min(...xs)),
    y0: clamp(Math.min(...ys)),
    x1: clamp(Math.max(...xs)),
    y1: clamp(Math.max(...ys)),
  };
}

/**
 * Runs Google Cloud Vision document text detection over one or more images.
 * `content` must be base64 without a data-URL prefix.
 */
export async function runGoogleVisionOcr(
  images: { content: string; side: string }[],
): Promise<OcrOutcome> {
  const key = googleVisionKey();
  const base = {
    provider: "google_vision" as const,
    providerLabel: OCR_PROVIDERS.google_vision.label,
    model: "DOCUMENT_TEXT_DETECTION",
  };
  if (!key) {
    return {
      ...base,
      status: "not_configured",
      rawText: "",
      blocks: [],
      meanConfidence: null,
      wordCount: 0,
      durationMs: 0,
      error: ocrConfigStatus().message,
    };
  }
  if (images.length === 0) {
    return {
      ...base,
      status: "failed",
      rawText: "",
      blocks: [],
      meanConfidence: null,
      wordCount: 0,
      durationMs: 0,
      error: "No images were supplied for reading.",
    };
  }

  const started = Date.now();
  const body = {
    requests: images.slice(0, 6).map((img) => ({
      image: { content: img.content },
      features: [{ type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 }],
      imageContext: { languageHints: ["en", "hi", "mr"] },
    })),
  };

  let res: Response;
  try {
    res = await fetch(`${VISION_ENDPOINT}?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return {
      ...base,
      status: "failed",
      rawText: "",
      blocks: [],
      meanConfidence: null,
      wordCount: 0,
      durationMs: Date.now() - started,
      error: "The OCR service could not be reached. Check the connection and retry.",
    };
  }

  if (!res.ok) {
    const text = await res.text();
    let message = "The OCR service rejected the request.";
    if (res.status === 400) message = "The OCR service rejected the image. Retake it and try again.";
    if (res.status === 403)
      message =
        "The configured Google Cloud Vision credential was refused. Check that the key is valid and that the Vision API is enabled for the project.";
    if (res.status === 429) message = "The OCR service is rate limited right now. Wait a moment and retry.";
    console.error("[ocr] vision error", res.status, text.slice(0, 400));
    return {
      ...base,
      status: "failed",
      rawText: "",
      blocks: [],
      meanConfidence: null,
      wordCount: 0,
      durationMs: Date.now() - started,
      error: message,
    };
  }

  const json = (await res.json()) as { responses?: VisionResponse[] };
  const responses = json.responses ?? [];
  const blocks: OcrBlock[] = [];
  const textParts: string[] = [];
  const confidences: number[] = [];
  let words = 0;
  const errors: string[] = [];

  responses.forEach((r, index) => {
    if (r.error?.message) {
      errors.push(r.error.message);
      return;
    }
    const side = images[index]?.side ?? "unknown";
    const full = r.fullTextAnnotation;
    if (!full?.text) return;
    textParts.push(`--- ${side} ---\n${full.text.trim()}`);
    const page = full.pages?.[0];
    const pw = page?.width ?? 1;
    const ph = page?.height ?? 1;
    for (const block of page?.blocks ?? []) {
      const paragraphTexts: string[] = [];
      for (const para of block.paragraphs ?? []) {
        const wordTexts: string[] = [];
        for (const w of para.words ?? []) {
          const t = (w.symbols ?? []).map((s) => s.text ?? "").join("");
          if (t) {
            wordTexts.push(t);
            words += 1;
            if (typeof w.confidence === "number") confidences.push(w.confidence);
          }
        }
        if (wordTexts.length) paragraphTexts.push(wordTexts.join(" "));
      }
      const text = paragraphTexts.join("\n").trim();
      if (!text) continue;
      blocks.push({
        text,
        confidence: typeof block.confidence === "number" ? block.confidence : 0,
        bbox: boxFrom(block.boundingBox, pw, ph),
        side,
        imageIndex: index,
      });
    }
  });

  const rawText = textParts.join("\n\n").trim();
  if (!rawText) {
    return {
      ...base,
      status: "failed",
      rawText: "",
      blocks: [],
      meanConfidence: null,
      wordCount: 0,
      durationMs: Date.now() - started,
      error:
        errors[0] ??
        "No readable text was found in these images. Retake the declaration panel closer and in better light.",
    };
  }

  return {
    ...base,
    status: "succeeded",
    rawText,
    blocks,
    meanConfidence: confidences.length
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : null,
    wordCount: words,
    durationMs: Date.now() - started,
    error: errors.length ? errors.join("; ") : null,
  };
}

/** Shape accepted from the on-device engine. Validated before it is trusted. */
export interface DeviceOcrPayload {
  provider: "tesseract_browser";
  rawText: string;
  blocks: OcrBlock[];
  meanConfidence: number | null;
  wordCount: number;
  durationMs: number;
}

export function normaliseDeviceOcr(payload: DeviceOcrPayload): OcrOutcome {
  const clamp = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
  const blocks = (payload.blocks ?? []).slice(0, 400).map((b) => ({
    text: String(b.text ?? "").slice(0, 600),
    confidence: clamp(Number(b.confidence ?? 0)),
    bbox: {
      x0: clamp(Number(b.bbox?.x0 ?? 0)),
      y0: clamp(Number(b.bbox?.y0 ?? 0)),
      x1: clamp(Number(b.bbox?.x1 ?? 0)),
      y1: clamp(Number(b.bbox?.y1 ?? 0)),
    },
    side: String(b.side ?? "unknown").slice(0, 32),
    imageIndex: Number.isFinite(b.imageIndex) ? Number(b.imageIndex) : 0,
  }));
  return {
    provider: "tesseract_browser",
    providerLabel: OCR_PROVIDERS.tesseract_browser.label,
    model: "tesseract-eng-lstm",
    status: payload.rawText.trim() === "" ? "failed" : "succeeded",
    rawText: payload.rawText.slice(0, 60000),
    blocks,
    meanConfidence:
      payload.meanConfidence == null ? null : clamp(Number(payload.meanConfidence)),
    wordCount: Number.isFinite(payload.wordCount) ? Number(payload.wordCount) : 0,
    durationMs: Number.isFinite(payload.durationMs) ? Number(payload.durationMs) : 0,
    error:
      payload.rawText.trim() === ""
        ? "The on-device reader found no legible text in these images."
        : null,
  };
}

/** Finds the OCR block that best contains a snippet, for evidence highlighting. */
export function locateSnippet(blocks: OcrBlock[], snippet: string | null | undefined) {
  if (!snippet) return null;
  const needle = snippet.toLowerCase().replace(/\s+/g, " ").trim();
  if (needle.length < 3) return null;
  let best: { block: OcrBlock; score: number } | null = null;
  for (const block of blocks) {
    const hay = block.text.toLowerCase().replace(/\s+/g, " ");
    let score = 0;
    if (hay.includes(needle)) score = 1;
    else {
      const tokens = needle.split(" ").filter((t) => t.length > 2);
      if (tokens.length) score = tokens.filter((t) => hay.includes(t)).length / tokens.length;
    }
    if (score > 0.34 && (!best || score > best.score)) best = { block, score };
  }
  return best?.block ?? null;
}
