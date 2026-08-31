/**
 * Browser-side image helpers shared by the public scan and complaint forms.
 * Photographs are downscaled before upload so a phone picture fits inside the
 * request limit without losing the printed declarations.
 */

export interface PreparedImage {
  base64: string;
  width: number;
  height: number;
  bytes: number;
}

export async function fileToJpegBase64(
  file: File,
  maxDimension = 1600,
  quality = 0.82,
): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("That file could not be opened as an image."));
      el.src = url;
    });
    const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser could not process the image.");
    ctx.drawImage(img, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    return { base64, width, height, bytes: Math.round((base64.length * 3) / 4) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function base64Preview(base64: string) {
  return `data:image/jpeg;base64,${base64}`;
}
