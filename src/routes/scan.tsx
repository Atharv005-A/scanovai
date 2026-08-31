import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Loader2, ScanBarcode, Search, ShieldAlert, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { PublicShell } from "@/components/public-shell";
import { ResultBadge, OverallBadge } from "@/components/status";
import { BarcodeScanner } from "@/components/image-capture";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { publicBarcodeLookup, publicPackageCheck } from "@/lib/public.functions";
import { fileToJpegBase64, base64Preview } from "@/lib/image-file";
import { CATEGORY_GROUPS, CATEGORY_LABELS, FIELD_LABELS, REGISTRY_MATCH_LABELS, type CheckResult } from "@/lib/domain";

export const Route = createFileRoute("/scan")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Check a packaged product — SCANOVA-AI" },
      {
        name: "description",
        content:
          "Photograph a package or enter its barcode to get a preliminary reading of its label declarations against the Legal Metrology (Packaged Commodities) Rules, 2011. No account needed.",
      },
      { property: "og:title", content: "Check a packaged product — SCANOVA-AI" },
      {
        property: "og:description",
        content: "Free consumer package check: read the label, compare with the product registry.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GuestScan,
});

type Side = "front" | "back" | "declaration";
const SIDES: { value: Side; label: string }[] = [
  { value: "front", label: "Front of pack" },
  { value: "back", label: "Back of pack" },
  { value: "declaration", label: "Declaration close-up" },
];

interface Shot {
  base64: string;
  side: Side;
  name: string;
}

function GuestScan() {
  const lookup = useServerFn(publicBarcodeLookup);
  const check = useServerFn(publicPackageCheck);

  const [barcode, setBarcode] = useState("");
  const [category, setCategory] = useState<string>("auto");
  const [shots, setShots] = useState<Shot[]>([]);
  const [side, setSide] = useState<Side>("front");

  const lookupM = useMutation({
    mutationFn: () => lookup({ data: { barcode } }),
    onError: (e: Error) => toast.error(e.message),
  });

  const checkM = useMutation({
    mutationFn: () =>
      check({
        data: {
          barcode: barcode.trim() ? barcode.trim() : null,
          category: category === "auto" ? null : category,
          images: shots.map((s) => ({ base64: s.base64, side: s.side })),
        },
      }),
    onError: (e: Error) => toast.error(e.message),
  });

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    for (const file of Array.from(files).slice(0, 3 - shots.length)) {
      try {
        const prepared = await fileToJpegBase64(file);
        setShots((s) => [...s, { base64: prepared.base64, side, name: file.name }]);
      } catch (e) {
        toast.error((e as Error).message);
      }
    }
  }

  const result = checkM.data;

  return (
    <PublicShell active="scan">
      <h1 className="text-2xl font-bold md:text-3xl">Check a packaged product</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Add up to three photographs of the pack, and the barcode if it has one. You will get a
        preliminary reading of the mandatory declarations. No account is needed.
      </p>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Barcode (optional)</CardTitle>
            <CardDescription>
              If the product is in the registry, we can compare the pack with what the manufacturer
              declared.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="e.g. 8901234567890"
                inputMode="numeric"
                aria-label="Barcode"
              />
              <Button
                variant="outline"
                onClick={() => lookupM.mutate()}
                disabled={barcode.trim().length < 4 || lookupM.isPending}
              >
                {lookupM.isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                <span className="ml-1.5 hidden sm:inline">Look up</span>
              </Button>
            </div>
            <BarcodeScanner
              onDetected={(value) => {
                setBarcode(value);
                toast.success("Barcode read from the camera.");
              }}
            />

            {lookupM.data && (
              <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                {lookupM.data.product ? (
                  <div className="space-y-1">
                    <p className="font-semibold">{lookupM.data.product.name}</p>
                    <p className="text-muted-foreground">
                      {lookupM.data.product.manufacturer_name ?? "Manufacturer not published"} ·{" "}
                      {CATEGORY_LABELS[lookupM.data.product.category] ?? lookupM.data.product.category}
                    </p>
                    <p className="text-muted-foreground">
                      Declared MRP: {lookupM.data.product.declared_mrp ?? "—"} · Net quantity:{" "}
                      {lookupM.data.product.declared_net_quantity ?? "—"}
                    </p>
                  </div>
                ) : (
                  <p className="text-muted-foreground">{lookupM.data.message}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Photographs</CardTitle>
            <CardDescription>Sharp, straight-on photos of the printed declarations work best.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Select value={side} onValueChange={(v) => setSide(v as Side)}>
                <SelectTrigger className="w-44" aria-label="Which side of the pack">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SIDES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button asChild variant="outline" disabled={shots.length >= 3}>
                <label className="cursor-pointer">
                  <Camera className="size-4" />
                  <span className="ml-1.5">Camera</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => void addFiles(e.target.files)}
                  />
                </label>
              </Button>
              <Button asChild variant="outline" disabled={shots.length >= 3}>
                <label className="cursor-pointer">
                  <Upload className="size-4" />
                  <span className="ml-1.5">Upload</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => void addFiles(e.target.files)}
                  />
                </label>
              </Button>
            </div>

            {shots.length === 0 ? (
              <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                No photographs added yet.
              </p>
            ) : (
              <ul className="grid grid-cols-3 gap-2">
                {shots.map((s, i) => (
                  <li key={i} className="relative overflow-hidden rounded-md border border-border">
                    <img
                      src={base64Preview(s.base64)}
                      alt={`${SIDES.find((x) => x.value === s.side)?.label ?? s.side} photograph`}
                      className="h-24 w-full object-cover"
                    />
                    <span className="absolute left-1 top-1 rounded bg-background/85 px-1 text-[10px] font-medium">
                      {SIDES.find((x) => x.value === s.side)?.label}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="absolute right-0.5 top-0.5 size-6 bg-background/80"
                      aria-label="Remove photograph"
                      onClick={() => setShots((all) => all.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-center gap-2">
              <Label htmlFor="cat" className="text-sm">
                Category
              </Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="cat" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Detect automatically</SelectItem>
                  {CATEGORY_GROUPS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              className="w-full"
              disabled={shots.length === 0 || checkM.isPending}
              onClick={() => checkM.mutate()}
            >
              {checkM.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Reading the label…
                </>
              ) : (
                <>
                  <ScanBarcode className="size-4" /> Check this package
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {result && (
        <section className="mt-8 space-y-5">
          <Alert>
            <ShieldAlert className="size-4" />
            <AlertTitle>Preliminary consumer check</AlertTitle>
            <AlertDescription>{result.disclaimer}</AlertDescription>
          </Alert>

          {result.ocr.status !== "succeeded" ? (
            <Card>
              <CardContent className="space-y-2 pt-6">
                <p className="font-semibold">The text could not be read</p>
                <p className="text-sm text-muted-foreground">{result.ocr.message}</p>
                <p className="text-xs text-muted-foreground">Engine: {result.ocr.provider}</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
                  <div>
                    <CardTitle className="text-base">Reading summary</CardTitle>
                    <CardDescription>
                      Engine: {result.ocr.provider}
                      {result.scanCode ? ` · Reference ${result.scanCode}` : ""}
                    </CardDescription>
                  </div>
                  {result.assessment?.overall && <OverallBadge result={result.assessment.overall} />}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Counter label="Pass" value={result.assessment?.counts.pass ?? 0} />
                    <Counter label="Fail" value={result.assessment?.counts.fail ?? 0} />
                    <Counter label="Needs review" value={result.assessment?.counts.needs_review ?? 0} />
                    <Counter label="Manual check" value={result.assessment?.counts.manual ?? 0} />
                  </div>

                  {result.registry && (
                    <p className="rounded-md bg-muted/50 p-3 text-sm">
                      <span className="font-medium">
                        {REGISTRY_MATCH_LABELS[result.registry.match as never] ?? "Registry"}:{" "}
                      </span>
                      {result.registry.headline}
                    </p>
                  )}

                  <div>
                    <h2 className="text-sm font-semibold">What was printed on the pack</h2>
                    <dl className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                      {result.declarations.map((d) => (
                        <div key={d.field_key} className="flex justify-between gap-3 text-sm">
                          <dt className="text-muted-foreground">{FIELD_LABELS[d.field_key] ?? d.field_key}</dt>
                          <dd className="text-right font-medium">{d.value}</dd>
                        </div>
                      ))}
                    </dl>
                    {(result.missing ?? []).length > 0 && (
                      <p className="mt-3 text-sm text-muted-foreground">
                        Not found in the photographs:{" "}
                        {(result.missing ?? []).map((m) => FIELD_LABELS[m] ?? m).join(", ")}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Rule-by-rule reading</CardTitle>
                  <CardDescription>
                    {result.assessment?.rule_version
                      ? `Rule set ${result.assessment.rule_version} · ${result.assessment.source_document ?? "Legal Metrology (Packaged Commodities) Rules, 2011"}`
                      : "Rule set unavailable"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(result.assessment?.items ?? []).map((item, i) => (
                    <div key={i} className="rounded-md border border-border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold">
                          {item.rule_number} — {item.title}
                        </p>
                        <ResultBadge result={item.result as CheckResult} />
                      </div>
                      <p className="mt-1.5 text-sm text-muted-foreground">{item.explanation}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.source_section}
                        {item.source_page ? ` · page ${item.source_page}` : ""}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <div className="flex flex-wrap gap-3">
                <Button asChild>
                  <Link to="/report">Report this package to the authority</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/rules">See the rules used</Link>
                </Button>
              </div>
            </>
          )}
        </section>
      )}
    </PublicShell>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <Badge variant="outline" className="gap-1.5 px-2.5 py-1 text-sm">
      <span className="font-semibold">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </Badge>
  );
}
