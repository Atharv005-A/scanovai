import { ExternalLink, MapPin } from "lucide-react";

interface Props {
  latitude?: number | null;
  longitude?: number | null;
  label?: string | null;
  height?: number;
  className?: string;
}

/**
 * Map preview for a reported location. Uses OpenStreetMap's embed tiles, so it
 * needs no API key and no third-party account.
 */
export function LocationMap({ latitude, longitude, label, height = 180, className }: Props) {
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return (
      <div className={className}>
        <div
          className="flex items-center justify-center rounded-md border border-dashed border-border bg-muted/30 text-xs text-muted-foreground"
          style={{ height }}
        >
          Location not shared
        </div>
      </div>
    );
  }

  const d = 0.004;
  const bbox = `${longitude - d},${latitude - d},${longitude + d},${latitude + d}`;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude},${longitude}`;
  const link = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`;

  return (
    <div className={className}>
      <div className="overflow-hidden rounded-md border border-border">
        <iframe
          title={label ? `Map of ${label}` : "Reported location"}
          src={src}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="w-full border-0"
          style={{ height }}
        />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <MapPin className="size-3.5" />
        <span>{label ? `${label} · ` : ""}{latitude.toFixed(5)}, {longitude.toFixed(5)}</span>
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          Open larger map <ExternalLink className="size-3" />
        </a>
      </div>
    </div>
  );
}
