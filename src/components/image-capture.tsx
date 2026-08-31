import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Upload, Trash2, Loader2, ScanBarcode, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IMAGE_SIDES } from "@/lib/domain";

const BUCKET = "inspection-images";
const MAX_BYTES = 15 * 1024 * 1024;

interface ImageRow {
  id: string;
  storage_path: string;
  side: string;
  quality_score: number | null;
  quality_note: string | null;
  width: number | null;
  height: number | null;
}

/** Reads dimensions and a cheap sharpness/exposure estimate in the browser. */
async function inspectImage(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("This file could not be opened as an image."));
      el.src = url;
    });
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const side = 240;
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext("2d");
    let score = 0.6;
    let note = "";
    if (ctx) {
      ctx.drawImage(img, 0, 0, side, side);
      const { data } = ctx.getImageData(0, 0, side, side);
      const grey = new Float64Array(side * side);
      let sum = 0;
      for (let i = 0; i < grey.length; i++) {
        const p = i * 4;
        grey[i] = 0.299 * data[p]! + 0.587 * data[p + 1]! + 0.114 * data[p + 2]!;
        sum += grey[i]!;
      }
      const mean = sum / grey.length;
      // Laplacian variance approximates focus.
      let lapSum = 0;
      let lapSq = 0;
      let n = 0;
      for (let yy = 1; yy < side - 1; yy++) {
        for (let xx = 1; xx < side - 1; xx++) {
          const i = yy * side + xx;
          const v =
            4 * grey[i]! - grey[i - 1]! - grey[i + 1]! - grey[i - side]! - grey[i + side]!;
          lapSum += v;
          lapSq += v * v;
          n++;
        }
      }
      const variance = lapSq / n - (lapSum / n) ** 2;
      const focus = Math.min(1, variance / 500);
      const exposure = mean < 45 ? 0.3 : mean > 225 ? 0.35 : 1;
      const resolution = Math.min(1, Math.min(w, h) / 900);
      score = Math.max(0.05, Math.min(1, focus * 0.5 + exposure * 0.3 + resolution * 0.2));
      const problems: string[] = [];
      if (focus < 0.35) problems.push("looks blurred");
      if (mean < 45) problems.push("very dark");
      if (mean > 225) problems.push("over-exposed / glare");
      if (Math.min(w, h) < 700) problems.push("low resolution");
      note = problems.length ? `This photo ${problems.join(", ")} — consider retaking it.` : "Good quality.";
    }
    return { width: w, height: h, score, note };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ImageCapture({
  inspectionId,
  userId,
  disabled,
}: {
  inspectionId: string;
  userId: string;
  disabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const [side, setSide] = useState<string>("front");
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ url: string; path: string } | null>(null);

  const images = useQuery({
    queryKey: ["inspection-images", inspectionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspection_images")
        .select("id, storage_path, side, quality_score, quality_note, width, height")
        .eq("inspection_id", inspectionId)
        .order("created_at");
      if (error) throw error;
      return data as ImageRow[];
    },
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > MAX_BYTES) throw new Error("Images must be smaller than 15 MB.");
      if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
      const meta = await inspectImage(file);
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${userId}/${inspectionId}/${side}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw new Error(upErr.message);
      const { error } = await supabase.from("inspection_images").insert({
        inspection_id: inspectionId,
        storage_path: path,
        side,
        quality_score: Number(meta.score.toFixed(2)),
        quality_note: meta.note,
        width: meta.width,
        height: meta.height,
      });
      if (error) throw new Error(error.message);
      await supabase.from("inspections").update({ status: "capturing" }).eq("id", inspectionId);
      return meta;
    },
    onSuccess: (meta) => {
      if (meta.score < 0.45) toast.warning(meta.note);
      else toast.success("Image added.");
      queryClient.invalidateQueries({ queryKey: ["inspection-images", inspectionId] });
      queryClient.invalidateQueries({ queryKey: ["inspection", inspectionId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (row: ImageRow) => {
      await supabase.storage.from(BUCKET).remove([row.storage_path]);
      const { error } = await supabase.from("inspection_images").delete().eq("id", row.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Image removed.");
      queryClient.invalidateQueries({ queryKey: ["inspection-images", inspectionId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function openPreview(row: ImageRow) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(row.storage_path, 600);
    if (!data?.signedUrl) {
      toast.error("This image could not be opened.");
      return;
    }
    setPreview({ url: data.signedUrl, path: row.storage_path });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1 space-y-1.5">
          <label className="text-sm font-medium">Which part of the pack?</label>
          <Select value={side} onValueChange={setSide}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {IMAGE_SIDES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={disabled || upload.isPending}
        >
          {upload.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Camera className="mr-2 size-4" />
          )}
          Take photo
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || upload.isPending}
        >
          <Upload className="mr-2 size-4" /> Upload
        </Button>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload.mutate(f);
            e.target.value = "";
          }}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload.mutate(f);
            e.target.value = "";
          }}
        />
      </div>

      {images.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading images…</p>
      ) : (images.data ?? []).length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No images yet. Capture the front, back and a close-up of the declaration panel for the best reading.
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(images.data ?? []).map((row) => (
            <li key={row.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="secondary">
                  {IMAGE_SIDES.find((s) => s.value === row.side)?.label ?? row.side}
                </Badge>
                {!disabled && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove image"
                    onClick={() => remove.mutate(row)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                )}
              </div>
              <button
                type="button"
                onClick={() => openPreview(row)}
                className="mt-2 text-left text-xs text-info underline"
              >
                Open preview
              </button>
              <p className="mt-1 text-xs text-muted-foreground">
                {row.width && row.height ? `${row.width}×${row.height}px · ` : ""}
                {row.quality_score !== null ? `quality ${Math.round(row.quality_score * 100)}%` : ""}
              </p>
              {row.quality_note && (
                <p
                  className={
                    (row.quality_score ?? 1) < 0.45
                      ? "mt-1 text-xs text-destructive"
                      : "mt-1 text-xs text-muted-foreground"
                  }
                >
                  {row.quality_note}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-label="Image preview"
          onClick={() => setPreview(null)}
        >
          <img src={preview.url} alt="Captured package" className="max-h-full max-w-full rounded-md" />
          <Button
            variant="secondary"
            size="icon"
            className="absolute right-4 top-4"
            aria-label="Close preview"
            onClick={() => setPreview(null)}
          >
            <X className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

/** Scans a barcode from the live camera using ZXing, loaded only on demand. */
export function BarcodeScanner({ onDetected }: { onDetected: (value: string, format: string) => void }) {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopRef = useRef<(() => void) | null>(null);

  async function start() {
    setError(null);
    setActive(true);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/library");
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromVideoDevice(null, videoRef.current!, (result) => {
        if (!result) return;
        onDetected(result.getText(), String(result.getBarcodeFormat()));
        stop();
      });
      stopRef.current = () => {
        controls.stop();
        reader.reset();
      };
    } catch {
      setError("The camera could not be started. You can type the barcode instead.");
      setActive(false);
    }
  }

  function stop() {
    stopRef.current?.();
    stopRef.current = null;
    setActive(false);
  }

  return (
    <div className="space-y-2">
      {!active ? (
        <Button type="button" variant="outline" onClick={start}>
          <ScanBarcode className="mr-2 size-4" /> Scan barcode
        </Button>
      ) : (
        <div className="space-y-2">
          <video ref={videoRef} className="w-full max-w-sm rounded-md border border-border" muted />
          <Button type="button" variant="ghost" onClick={stop}>
            Stop scanning
          </Button>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
