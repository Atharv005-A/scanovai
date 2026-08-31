/**
 * On-device OCR (browser only).
 *
 * Runs the real Tesseract engine compiled to WebAssembly. This is a genuine
 * OCR engine — not an AI vision model dressed up as one — and is used when the
 * server-side Google Cloud Vision credential is not configured, or when the
 * inspector explicitly chooses on-device reading.
 *
 * The engine is loaded lazily on first use so it never affects first paint.
 */

import type { OcrBlock } from "./ocr.server";

export interface DeviceOcrResult {
  provider: "tesseract_browser";
  rawText: string;
  blocks: OcrBlock[];
  meanConfidence: number | null;
  wordCount: number;
  durationMs: number;
}

export interface DeviceOcrProgress {
  stage: string;
  progress: number;
  imageIndex: number;
  imageCount: number;
}

type TesseractWorker = {
  recognize: (
    image: Blob | string,
    options?: Record<string, unknown>,
    output?: Record<string, boolean>,
  ) => Promise<{ data: TesseractPage }>;
  terminate: () => Promise<unknown>;
};

interface TesseractBbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
interface TesseractWord {
  text?: string;
  confidence?: number;
  bbox?: TesseractBbox;
}
interface TesseractLine {
  text?: string;
  confidence?: number;
  bbox?: TesseractBbox;
  words?: TesseractWord[];
}
interface TesseractParagraph {
  lines?: TesseractLine[];
}
interface TesseractBlock {
  text?: string;
  confidence?: number;
  bbox?: TesseractBbox;
  paragraphs?: TesseractParagraph[];
}
interface TesseractPage {
  text?: string;
  confidence?: number;
  blocks?: TesseractBlock[] | null;
}

let workerPromise: Promise<TesseractWorker> | null = null;

async function getWorker(onProgress?: (p: { stage: string; progress: number }) => void) {
  if (!workerPromise) {
    workerPromise = (async () => {
      const mod = await import("tesseract.js");
      const createWorker = (mod as unknown as { createWorker: unknown }).createWorker as (
        langs: string,
        oem: number,
        options: Record<string, unknown>,
      ) => Promise<TesseractWorker>;
      return createWorker("eng", 1, {
        logger: (m: { status?: string; progress?: number }) =>
          onProgress?.({ stage: m.status ?? "working", progress: m.progress ?? 0 }),
      });
    })().catch((e) => {
      workerPromise = null;
      throw e;
    });
  }
  return workerPromise;
}

/** Releases the WASM worker; call when leaving a scanning screen. */
export async function releaseDeviceOcr() {
  const current = workerPromise;
  workerPromise = null;
  if (current) {
    try {
      const worker = await current;
      await worker.terminate();
    } catch {
      /* already gone */
    }
  }
}

async function imageSize(blob: Blob) {
  try {
    const bitmap = await createImageBitmap(blob);
    const size = { w: bitmap.width, h: bitmap.height };
    bitmap.close?.();
    return size;
  } catch {
    return { w: 1, h: 1 };
  }
}

export async function runDeviceOcr(
  images: { blob: Blob; side: string }[],
  onProgress?: (p: DeviceOcrProgress) => void,
): Promise<DeviceOcrResult> {
  if (images.length === 0) throw new Error("There are no images to read.");
  const started = Date.now();
  const worker = await getWorker((p) =>
    onProgress?.({ ...p, imageIndex: 0, imageCount: images.length }),
  );

  const blocks: OcrBlock[] = [];
  const textParts: string[] = [];
  const confidences: number[] = [];
  let words = 0;

  for (let i = 0; i < images.length; i++) {
    const image = images[i]!;
    onProgress?.({ stage: "reading", progress: 0, imageIndex: i, imageCount: images.length });
    const { w, h } = await imageSize(image.blob);
    const { data } = await worker.recognize(image.blob, {}, { text: true, blocks: true });
    const pageText = (data.text ?? "").trim();
    if (pageText) textParts.push(`--- ${image.side} ---\n${pageText}`);

    for (const block of data.blocks ?? []) {
      const text = (block.text ?? "").trim();
      if (!text) continue;
      const bbox = block.bbox ?? { x0: 0, y0: 0, x1: 0, y1: 0 };
      blocks.push({
        text,
        confidence: Math.max(0, Math.min(1, (block.confidence ?? 0) / 100)),
        bbox: {
          x0: bbox.x0 / Math.max(w, 1),
          y0: bbox.y0 / Math.max(h, 1),
          x1: bbox.x1 / Math.max(w, 1),
          y1: bbox.y1 / Math.max(h, 1),
        },
        side: image.side,
        imageIndex: i,
      });
      for (const para of block.paragraphs ?? []) {
        for (const line of para.lines ?? []) {
          for (const word of line.words ?? []) {
            if ((word.text ?? "").trim()) {
              words += 1;
              confidences.push(Math.max(0, Math.min(1, (word.confidence ?? 0) / 100)));
            }
          }
        }
      }
    }
    if (typeof data.confidence === "number" && (data.blocks ?? []).length === 0) {
      confidences.push(Math.max(0, Math.min(1, data.confidence / 100)));
    }
  }

  return {
    provider: "tesseract_browser",
    rawText: textParts.join("\n\n").trim(),
    blocks,
    meanConfidence: confidences.length
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : null,
    wordCount: words,
    durationMs: Date.now() - started,
  };
}
