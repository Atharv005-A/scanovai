import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Copy, Loader2, MapPin, Upload } from "lucide-react";
import { toast } from "sonner";

import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fileToJpegBase64, base64Preview } from "@/lib/image-file";
import { submitPublicComplaint } from "@/lib/public.functions";

export const Route = createFileRoute("/report")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Report a mislabelled package — SCANOVA-AI" },
      {
        name: "description",
        content:
          "Report a suspected labelling or weights-and-measures problem on a packaged commodity. No account required; you get a tracking code.",
      },
      { property: "og:title", content: "Report a mislabelled package — SCANOVA-AI" },
      {
        property: "og:description",
        content: "File a Legal Metrology complaint with a photograph and follow it with a tracking code.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportPage,
});

function ReportPage() {
  const submit = useServerFn(submitPublicComplaint);

  const [productName, setProductName] = useState("");
  const [manufacturerName, setManufacturerName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [description, setDescription] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [region, setRegion] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [image, setImage] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: () =>
      submit({
        data: {
          productName: productName.trim(),
          manufacturerName: manufacturerName.trim() || null,
          barcode: barcode.trim() || null,
          description: description.trim(),
          guestName: guestName.trim() || null,
          guestEmail: guestEmail.trim() || null,
          region: region.trim() || null,
          latitude: coords?.lat ?? null,
          longitude: coords?.lng ?? null,
          imageBase64: image,
        },
      }),
    onError: (e: Error) => toast.error(e.message),
  });

  function useMyLocation() {
    if (!navigator.geolocation) return toast.error("This browser cannot share a location.");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        toast.success("Location attached to the report.");
      },
      () => toast.error("Location permission was declined."),
    );
  }

  const valid = productName.trim().length >= 2 && description.trim().length >= 20;

  if (m.data) {
    return (
      <PublicShell active="report">
        <Card className="mx-auto max-w-xl">
          <CardHeader>
            <CheckCircle2 className="size-8 text-success" />
            <CardTitle>Report recorded</CardTitle>
            <CardDescription>{m.data.message}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border border-border bg-muted/40 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Complaint number</p>
              <p className="font-mono text-lg font-semibold">{m.data.code}</p>
              <p className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">Tracking code</p>
              <div className="flex items-center gap-2">
                <p className="font-mono text-lg font-semibold">{m.data.trackingToken}</p>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Copy tracking code"
                  onClick={() => {
                    void navigator.clipboard.writeText(m.data!.trackingToken);
                    toast.success("Tracking code copied.");
                  }}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
            </div>
            <div className="flex gap-2">
              <Button asChild>
                <Link to="/track" search={{ token: m.data.trackingToken }}>
                  Track this report
                </Link>
              </Button>
              <Button variant="outline" onClick={() => m.reset()}>
                File another
              </Button>
            </div>
          </CardContent>
        </Card>
      </PublicShell>
    );
  }

  return (
    <PublicShell active="report">
      <h1 className="text-2xl font-bold md:text-3xl">Report a mislabelled package</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Describe what you saw on the pack. An officer reviews every report; the system never closes
        one automatically.
      </p>

      <Card className="mt-6 max-w-2xl">
        <CardContent className="space-y-4 pt-6">
          <Field label="Product name" required>
            <Input value={productName} onChange={(e) => setProductName(e.target.value)} maxLength={200} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Manufacturer or packer">
              <Input
                value={manufacturerName}
                onChange={(e) => setManufacturerName(e.target.value)}
                maxLength={200}
              />
            </Field>
            <Field label="Barcode">
              <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} inputMode="numeric" />
            </Field>
          </div>

          <Field label="What is wrong?" required hint="At least 20 characters, e.g. no MRP printed, net quantity unclear, expired date.">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              maxLength={4000}
            />
          </Field>

          <div>
            <Label className="text-sm">Photograph of the pack</Label>
            <div className="mt-1.5 flex items-center gap-3">
              <Button asChild variant="outline">
                <label className="cursor-pointer">
                  <Upload className="size-4" />
                  <span className="ml-1.5">{image ? "Replace photo" : "Add photo"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        setImage((await fileToJpegBase64(file)).base64);
                      } catch (err) {
                        toast.error((err as Error).message);
                      }
                    }}
                  />
                </label>
              </Button>
              {image && (
                <img
                  src={base64Preview(image)}
                  alt="Evidence photograph attached to the report"
                  className="h-16 w-16 rounded-md border border-border object-cover"
                />
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your name" hint="Optional">
              <Input value={guestName} onChange={(e) => setGuestName(e.target.value)} maxLength={120} />
            </Field>
            <Field label="Your email" hint="Optional — used only for updates">
              <Input
                type="email"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                maxLength={160}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Where did you see it?" hint="Town, district or shop area">
              <Input value={region} onChange={(e) => setRegion(e.target.value)} maxLength={120} />
            </Field>
            <div className="flex items-end">
              <Button type="button" variant="outline" onClick={useMyLocation}>
                <MapPin className="size-4" />
                <span className="ml-1.5">{coords ? "Location attached" : "Use my location"}</span>
              </Button>
            </div>
          </div>

          <Button className="w-full" disabled={!valid || m.isPending} onClick={() => m.mutate()}>
            {m.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            <span className="ml-1.5">Submit report</span>
          </Button>
        </CardContent>
      </Card>
    </PublicShell>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="text-sm">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
