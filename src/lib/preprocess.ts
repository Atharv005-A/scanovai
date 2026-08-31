/**
 * Browser image pipeline used before OCR.
 *
 * The ORIGINAL file is never modified: it is uploaded as-is and kept as
 * evidence. A separate, derived image is produced purely to help the OCR
 * engine (orientation corrected, resized, contrast stretched, sharpened) and
 * is stored alongside the original as a processing artefact.
 *
 * If a photograph is too blurred, too dark or too small, the caller is told to
 * retake it. Nothing is ever invented to compensate for a bad photograph.
 */

export interface QualityMetrics {
  width: number;
  height: number;
  /** 0..1 — Laplacian variance based focus estimate. */
  focus: number;
  /** Mean luminance, 0..255. */
  brightness: number;
  /** Normalised standard deviation of luminance, 0..1. */
  contrast: number;
  /** Combined 0..1 usability score. */
  score: number;
  problems: string[];
  note: string;
  usable: boolean;
}

export interface PreprocessResult {
  metrics: QualityMetrics;
  /** Derived, OCR-optimised image. Never replaces the original. */
  processed: Blob;
  processedNote: string;
  processedWidth: number;
  processedHeight: number;
  originalBytes: number;
  /** Set when the source carried a non-default EXIF orientation. */
  orientationCorrected: boolean;
}

const MAX_EDGE = 2200;
const MIN_EDGE_FOR_UPSCALE = 900;

async function decode(file: Blob): Promise<{ bitmap: ImageBitmap; corrected: boolean }> {
  // `from-image` applies the EXIF orientation flag; comparing dimensions with
  // the un-oriented decode tells us whether a rotation was actually applied.
  let oriented: ImageBitmap;
  try {
    oriented = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    oriented = await createImageBitmap(file);
  }
  let corrected = false;
  try {
    const plain = await createImageBitmap(file, { imageOrientation: "none" });
    corrected = plain.width !== oriented.width || plain.height !== oriented.height;
    plain.close?.();
  } catch {
    /* orientation comparison is best-effort */
  }
  return { bitmap: oriented, corrected };
}

function grayscaleStats(data: Uint8ClampedArray, w: number, h: number) {
  const grey = new Float32Array(w * h);
  let sum = 0;
  for (let i = 0; i < grey.length; i++) {
    const p = i * 4;
    const v = 0.299 * data[p]! + 0.587 * data[p + 1]! + 0.114 * data[p + 2]!;
    grey[i] = v;
    sum += v;
  }
  const mean = sum / grey.length;
  let varSum = 0;
  for (let i = 0; i < grey.length; i++) varSum += (grey[i]! - mean) ** 2;
  const stdDev = Math.sqrt(varSum / grey.length);

  // Laplacian variance approximates focus.
  let lapSum = 0;
  let lapSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = 4 * grey[i]! - grey[i - 1]! - grey[i + 1]! - grey[i - w]! - grey[i + w]!;
      lapSum += v;
      lapSq += v * v;
      n++;
    }
  }
  const lapVariance = n > 0 ? lapSq / n - (lapSum / n) ** 2 : 0;
  return { mean, stdDev, lapVariance };
}

function canvasOf(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

/** 3x3 unsharp-mask style convolution applied to a greyscale buffer. */
function sharpen(src: Uint8ClampedArray, w: number, h: number, amount: number) {
  const out = new Uint8ClampedArray(src.length);
  out.set(src);
  const centre = 1 + 4 * amount;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const v =
          centre * src[i + c]! -
          amount * src[i - 4 + c]! -
          amount * src[i + 4 + c]! -
          amount * src[i - w * 4 + c]! -
          amount * src[i + w * 4 + c]!;
        out[i + c] = v;
      }
      out[i + 3] = 255;
    }
  }
  return out;
}

/** Percentile contrast stretch, computed on the luminance histogram. */
function contrastStretch(data: Uint8ClampedArray) {
  const hist = new Uint32Array(256);
  const total = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const v = Math.round(0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!);
    hist[v] = (hist[v] ?? 0) + 1;
  }
  const lowCut = total * 0.02;
  const highCut = total * 0.02;
  let acc = 0;
  let low = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v]!;
    if (acc >= lowCut) {
      low = v;
      break;
    }
  }
  acc = 0;
  let high = 255;
  for (let v = 255; v >= 0; v--) {
    acc += hist[v]!;
    if (acc >= highCut) {
      high = v;
      break;
    }
  }
  if (high - low < 24) return data;
  const scale = 255 / (high - low);
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      data[i + c] = (data[i + c]! - low) * scale;
    }
  }
  return data;
}

export async function analyzeImage(file: Blob): Promise<QualityMetrics> {
  const { bitmap } = await decode(file);
  try {
    return metricsFor(bitmap);
  } finally {
    bitmap.close?.();
  }
}

function metricsFor(bitmap: ImageBitmap): QualityMetrics {
  const w = bitmap.width;
  const h = bitmap.height;
  const sample = 260;
  const canvas = canvasOf(sample, sample);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return {
      width: w,
      height: h,
      focus: 0.5,
      brightness: 128,
      contrast: 0.3,
      score: 0.5,
      problems: [],
      note: "The image could not be analysed in this browser; it was stored unchanged.",
      usable: true,
    };
  }
  ctx.drawImage(bitmap, 0, 0, sample, sample);
  const { data } = ctx.getImageData(0, 0, sample, sample);
  const { mean, stdDev, lapVariance } = grayscaleStats(data, sample, sample);

  const focus = Math.min(1, lapVariance / 520);
  const brightnessScore = mean < 45 ? 0.25 : mean < 70 ? 0.6 : mean > 228 ? 0.3 : 1;
  const contrast = Math.min(1, stdDev / 70);
  const resolution = Math.min(1, Math.min(w, h) / 900);
  const score = Math.max(
    0.05,
    Math.min(1, focus * 0.42 + brightnessScore * 0.24 + contrast * 0.14 + resolution * 0.2),
  );

  const problems: string[] = [];
  if (focus < 0.32) problems.push("looks out of focus");
  if (mean < 45) problems.push("is very dark");
  else if (mean < 70) problems.push("is under-exposed");
  if (mean > 228) problems.push("has glare or is over-exposed");
  if (stdDev < 26) problems.push("has very low contrast");
  if (Math.min(w, h) < 640) problems.push("is low resolution");

  return {
    width: w,
    height: h,
    focus,
    brightness: mean,
    contrast,
    score,
    problems,
    note: problems.length
      ? `This photo ${problems.join(", ")}. Retake it closer, holding the camera steady in even light.`
      : "Good quality — the declaration panel should be readable.",
    usable: score >= 0.34 && problems.length < 3,
  };
}

export async function preprocessForOcr(file: File | Blob): Promise<PreprocessResult> {
  const { bitmap, corrected } = await decode(file);
  try {
    const metrics = metricsFor(bitmap);

    const longest = Math.max(bitmap.width, bitmap.height);
    let scale = 1;
    if (longest > MAX_EDGE) scale = MAX_EDGE / longest;
    else if (Math.min(bitmap.width, bitmap.height) < MIN_EDGE_FOR_UPSCALE)
      scale = Math.min(2, MIN_EDGE_FOR_UPSCALE / Math.max(Math.min(bitmap.width, bitmap.height), 1));

    const tw = Math.max(1, Math.round(bitmap.width * scale));
    const th = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = canvasOf(tw, th);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const steps: string[] = [];
    if (corrected) steps.push("orientation corrected from EXIF");
    if (scale !== 1) steps.push(`resized to ${tw}×${th}px for the reader`);

    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, 0, 0, tw, th);
      const image = ctx.getImageData(0, 0, tw, th);
      contrastStretch(image.data);
      steps.push("contrast stretched");
      if (metrics.focus < 0.62) {
        const sharpened = sharpen(image.data, tw, th, 0.55);
        image.data.set(sharpened);
        steps.push("sharpened");
      }
      ctx.putImageData(image, 0, 0);
    }

    const processed = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("The processed image could not be produced."))),
        "image/jpeg",
        0.92,
      ),
    );

    return {
      metrics,
      processed,
      processedNote: steps.length
        ? `Reader copy: ${steps.join(", ")}. The original photograph is stored unchanged as evidence.`
        : "Reader copy created; the original photograph is stored unchanged as evidence.",
      processedWidth: tw,
      processedHeight: th,
      originalBytes: file.size,
      orientationCorrected: corrected,
    };
  } finally {
    bitmap.close?.();
  }
}

/** Compresses an image for transport (guest scans, complaint evidence). */
export async function compressForUpload(
  file: File | Blob,
  maxEdge = 1600,
  quality = 0.82,
): Promise<Blob> {
  const { bitmap } = await decode(file);
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = longest > maxEdge ? maxEdge / longest : 1;
    const tw = Math.max(1, Math.round(bitmap.width * scale));
    const th = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = canvasOf(tw, th);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, tw, th);
    return await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", quality),
    );
  } finally {
    bitmap.close?.();
  }
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
