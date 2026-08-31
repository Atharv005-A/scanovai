import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  Sparkles,
  Gavel,
  FileDown,
  CheckCircle2,
  ArrowLeft,
  Pencil,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  extractInspectionLabels,
  runComplianceCheck,
  correctDeclaration,
  finalizeInspection,
  generateInspectionReport,
} from "@/lib/inspection.functions";
import { buildReportPdf } from "@/lib/report-pdf";
import { ImageCapture, BarcodeScanner } from "@/components/image-capture";
import { OverallBadge, ResultBadge, ConfidenceChip } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CATEGORY_LABELS, FIELD_DEFS, FIELD_LABELS, type CheckResult } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/inspections/$id")({
  head: () => ({
    meta: [
      { title: "Inspection — SCANOVA-AI" },
      {
        name: "description",
        content: "Capture images, extract declarations, check compliance and generate the report.",
      },
      { property: "og:title", content: "Inspection — SCANOVA-AI" },
      { property: "og:description", content: "Full inspection workflow for a packaged commodity." },
    ],
  }),
  component: InspectionDetail,
});

type Declaration = {
  id: string;
  field_key: string;
  field_label: string;
  value: string | null;
  detected: boolean;
  confidence: number;
  band: string;
  corrected: boolean;
};

type Check = {
  id: string;
  rule_number: string;
  rule_code: string;
  title: string;
  requirement: string;
  detected_value: string | null;
  expected_condition: string | null;
  result: CheckResult;
  confidence: number;
  explanation: string;
  source_section: string | null;
  source_page: number | null;
};

function InspectionDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const extract = useServerFn(extractInspectionLabels);
  const check = useServerFn(runComplianceCheck);
  const correct = useServerFn(correctDeclaration);
  const finalize = useServerFn(finalizeInspection);
  const report = useServerFn(generateInspectionReport);

  const inspection = useQuery({
    queryKey: ["inspection", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("inspections").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const declarations = useQuery({
    queryKey: ["declarations", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("extracted_declarations")
        .select("id, field_key, field_label, value, detected, confidence, band, corrected")
        .eq("inspection_id", id);
      if (error) throw error;
      return data as Declaration[];
    },
  });

  const checks = useQuery({
    queryKey: ["checks", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("compliance_checks")
        .select(
          "id, rule_number, rule_code, title, requirement, detected_value, expected_condition, result, confidence, explanation, source_section, source_page",
        )
        .eq("inspection_id", id);
      if (error) throw error;
      return data as Check[];
    },
  });

  const corrections = useQuery({
    queryKey: ["corrections", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("field_corrections")
        .select("id, field_key, previous_value, new_value, reason, created_at")
        .eq("inspection_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const reports = useQuery({
    queryKey: ["reports", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("id, report_code, checksum, payload, created_at")
        .eq("inspection_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  function refreshAll() {
    for (const key of ["inspection", "declarations", "checks", "corrections", "reports"])
      queryClient.invalidateQueries({ queryKey: [key, id] });
  }

  const runExtract = useMutation({
    mutationFn: () => extract({ data: { inspectionId: id } }),
    onSuccess: (res) => {
      toast.success("Label read. Review each field before checking compliance.");
      if (res.quality && res.quality.usable === false)
        toast.warning(res.quality.note ?? "The images may be hard to read — consider retaking them.");
      refreshAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runCheck = useMutation({
    mutationFn: () => check({ data: { inspectionId: id } }),
    onSuccess: () => {
      toast.success("Compliance checked against the 2011 Rules.");
      refreshAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ins = inspection.data;
  const isOwner = !!ins && !!user && ins.inspector_id === user.id;
  const finalized = ins?.status === "finalized";

  if (inspection.isLoading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );

  if (inspection.error || !ins)
    return (
      <Alert variant="destructive">
        <AlertTitle>Inspection unavailable</AlertTitle>
        <AlertDescription>
          This inspection could not be opened. It may not exist, or you may not have permission to view it.
        </AlertDescription>
      </Alert>
    );

  const declRows = declarations.data ?? [];
  const checkRows = checks.data ?? [];
  const summary = summarise(checkRows);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link to="/inspections">
              <ArrowLeft className="mr-1.5 size-4" /> All inspections
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold">
            {ins.product_name || "Untitled package"}
            {ins.is_demo && (
              <Badge variant="outline" className="ml-2 align-middle text-[10px] uppercase">
                demo record
              </Badge>
            )}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {ins.reference_code} · {CATEGORY_LABELS[ins.category] ?? ins.category}
            {ins.manufacturer_name ? ` · ${ins.manufacturer_name}` : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <OverallBadge result={ins.result} />
          <Badge variant="secondary" className="capitalize">
            {ins.status}
          </Badge>
        </div>
      </div>

      {ins.conflict_flag && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Barcode record conflicts with the package</AlertTitle>
          <AlertDescription>{ins.conflict_note ?? "A linked product record disagrees with the printed label."}</AlertDescription>
        </Alert>
      )}

      <Steps
        images={(declRows.length > 0 || checkRows.length > 0) as boolean}
        declarations={declRows.length > 0}
        checked={checkRows.length > 0}
        finalized={finalized}
      />

      {/* 1 — evidence */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">1 · Package images</CardTitle>
          <CardDescription>
            Original images are kept unchanged as evidence. Capture the declaration panel close-up for the
            most reliable reading.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {user && <ImageCapture inspectionId={id} userId={user.id} disabled={finalized || !isOwner} />}
          <BarcodeBlock inspectionId={id} barcode={ins.barcode} disabled={finalized || !isOwner} />
        </CardContent>
      </Card>

      {/* 2 — extraction */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-lg">2 · Declarations read from the label</CardTitle>
            <CardDescription>
              AI reads printed text only. It never decides compliance, and low confidence means review — not
              a violation.
            </CardDescription>
          </div>
          {!finalized && isOwner && (
            <Button onClick={() => runExtract.mutate()} disabled={runExtract.isPending}>
              {runExtract.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 size-4" />
              )}
              {declRows.length > 0 ? "Read again" : "Extract information"}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {declarations.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : declRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing read yet. Capture at least one image, then extract the information.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {FIELD_DEFS.map((f) => {
                const row = declRows.find((d) => d.field_key === f.key);
                if (!row) return null;
                return (
                  <li key={f.key} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{f.label}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {row.value ? row.value : "not detected on the label"}
                      </p>
                    </div>
                    <ConfidenceChip value={Number(row.confidence)} />
                    {row.corrected && (
                      <Badge variant="outline" className="text-[10px] uppercase">
                        corrected
                      </Badge>
                    )}
                    {!finalized && isOwner && (
                      <CorrectDialog
                        fieldKey={f.key}
                        label={f.label}
                        current={row.value}
                        onSave={async (value, reason) => {
                          await correct({ data: { inspectionId: id, fieldKey: f.key, value, reason } });
                          toast.success("Correction recorded.");
                          refreshAll();
                        }}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* 3 — compliance */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-lg">3 · Rule assessment</CardTitle>
            <CardDescription>
              Deterministic checks taken only from the Legal Metrology (Packaged Commodities) Rules, 2011.
            </CardDescription>
          </div>
          {!finalized && isOwner && declRows.length > 0 && (
            <Button onClick={() => runCheck.mutate()} disabled={runCheck.isPending}>
              {runCheck.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Gavel className="mr-2 size-4" />
              )}
              {checkRows.length > 0 ? "Re-check compliance" : "Check compliance"}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {checkRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No checks yet. Review the declarations above, then run the compliance check.
            </p>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap gap-2">
                {(
                  [
                    ["pass", summary.pass],
                    ["fail", summary.fail],
                    ["needs_review", summary.needs_review],
                    ["manual_verification_required", summary.manual_verification_required],
                    ["not_applicable", summary.not_applicable],
                    ["unable_to_verify", summary.unable_to_verify],
                  ] as [CheckResult, number][]
                )
                  .filter(([, n]) => n > 0)
                  .map(([r, n]) => (
                    <span key={r} className="flex items-center gap-1.5">
                      <ResultBadge result={r} />
                      <span className="text-sm text-muted-foreground">{n}</span>
                    </span>
                  ))}
              </div>
              <Accordion type="multiple" className="w-full">
                {checkRows.map((c) => (
                  <AccordionItem key={c.id} value={c.id}>
                    <AccordionTrigger className="text-left">
                      <span className="flex flex-1 flex-wrap items-center gap-2 pr-3">
                        <span className="font-mono text-xs text-muted-foreground">{c.rule_number}</span>
                        <span className="flex-1 text-sm font-medium">{c.title}</span>
                        <ResultBadge result={c.result} />
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-2 text-sm">
                      <Field label="Requirement" value={c.requirement} />
                      <Field label="Detected on package" value={c.detected_value ?? "—"} />
                      <Field label="Expected" value={c.expected_condition ?? "—"} />
                      <Field label="Why" value={c.explanation} />
                      <Field
                        label="Source"
                        value={`${c.source_section ?? "—"}${c.source_page ? `, PDF page ${c.source_page}` : ""}`}
                      />
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </>
          )}
        </CardContent>
      </Card>

      {(corrections.data ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Correction history</CardTitle>
            <CardDescription>Every manual change is preserved with its reason.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border text-sm">
              {(corrections.data ?? []).map((c) => (
                <li key={c.id} className="py-2.5">
                  <p className="font-medium">{FIELD_LABELS[c.field_key] ?? c.field_key}</p>
                  <p className="text-muted-foreground">
                    “{c.previous_value ?? "—"}” → “{c.new_value ?? "—"}”
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.reason ? `Reason: ${c.reason} · ` : ""}
                    {new Date(c.created_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* 4 — finalize + report */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">4 · Finalize and report</CardTitle>
          <CardDescription>
            Finalizing locks the record. The report carries a report ID, checksum and rule version.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!finalized && isOwner && (
            <FinalizeBlock
              disabled={checkRows.length === 0}
              onFinalize={async (notes, supervisorReview) => {
                await finalize({
                  data: { inspectionId: id, notes, needsSupervisorReview: supervisorReview },
                });
                toast.success("Inspection finalized.");
                refreshAll();
              }}
            />
          )}
          {finalized && (
            <Alert>
              <CheckCircle2 className="size-4" />
              <AlertDescription>
                Finalized{ins.finalized_at ? ` on ${new Date(ins.finalized_at).toLocaleString()}` : ""}.
                {ins.supervisor_decision === "pending" ? " Awaiting supervisor review." : ""}
              </AlertDescription>
            </Alert>
          )}

          <ReportBlock
            inspectionId={id}
            disabled={checkRows.length === 0}
            existing={reports.data ?? []}
            onGenerate={async () => {
              const res = await report({ data: { inspectionId: id } });
              queryClient.invalidateQueries({ queryKey: ["reports", id] });
              return res;
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="font-medium">{label}: </span>
      <span className="text-muted-foreground">{value}</span>
    </p>
  );
}

function summarise(rows: { result: CheckResult }[]) {
  const base: Record<CheckResult, number> = {
    pass: 0,
    fail: 0,
    needs_review: 0,
    not_applicable: 0,
    unable_to_verify: 0,
    manual_verification_required: 0,
  };
  for (const r of rows) base[r.result] = (base[r.result] ?? 0) + 1;
  return base;
}

function Steps({
  images,
  declarations,
  checked,
  finalized,
}: {
  images: boolean;
  declarations: boolean;
  checked: boolean;
  finalized: boolean;
}) {
  const steps = [
    { label: "Capture", done: images || declarations },
    { label: "Extract", done: declarations },
    { label: "Check", done: checked },
    { label: "Finalize", done: finalized },
  ];
  return (
    <ol className="flex flex-wrap gap-2">
      {steps.map((s, i) => (
        <li
          key={s.label}
          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
            s.done
              ? "border-success/40 bg-success/12 text-success"
              : "border-border bg-muted text-muted-foreground"
          }`}
        >
          <span>{i + 1}</span>
          {s.label}
        </li>
      ))}
    </ol>
  );
}

function BarcodeBlock({
  inspectionId,
  barcode,
  disabled,
}: {
  inspectionId: string;
  barcode: string | null;
  disabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(barcode ?? "");

  useEffect(() => setValue(barcode ?? ""), [barcode]);

  const save = useMutation({
    mutationFn: async (input: { code: string; format?: string }) => {
      const { error } = await supabase
        .from("inspections")
        .update({ barcode: input.code || null, barcode_format: input.format ?? null })
        .eq("id", inspectionId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Barcode saved as supplementary evidence.");
      queryClient.invalidateQueries({ queryKey: ["inspection", inspectionId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <div>
        <p className="text-sm font-medium">Barcode / QR (optional)</p>
        <p className="text-xs text-muted-foreground">
          Used only as supplementary evidence. Conflicts with the printed label are flagged, never silently
          applied.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1 space-y-1.5">
          <Label htmlFor="bc-in">Barcode number</Label>
          <Input
            id="bc-in"
            value={value}
            disabled={disabled}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || save.isPending}
          onClick={() => save.mutate({ code: value.trim() })}
        >
          Save
        </Button>
      </div>
      {!disabled && (
        <BarcodeScanner
          onDetected={(code, format) => {
            setValue(code);
            save.mutate({ code, format });
          }}
        />
      )}
    </div>
  );
}

function CorrectDialog({
  fieldKey,
  label,
  current,
  onSave,
}: {
  fieldKey: string;
  label: string;
  current: string | null;
  onSave: (value: string, reason: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setValue(current ?? "");
      }}
    >
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={`Correct ${label}`}>
        <Pencil className="size-4" />
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Correct “{label}”</DialogTitle>
          <DialogDescription>
            Enter what is actually printed on the package. The original reading is kept in the correction
            history.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`v-${fieldKey}`}>Value on the package</Label>
            <Input id={`v-${fieldKey}`} value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`r-${fieldKey}`}>Reason for the correction</Label>
            <Textarea
              id={`r-${fieldKey}`}
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. text was partly obscured by glare"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave(value.trim(), reason.trim());
                setOpen(false);
                setReason("");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "The correction could not be saved.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
            Save correction and re-check
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FinalizeBlock({
  disabled,
  onFinalize,
}: {
  disabled: boolean;
  onFinalize: (notes: string, supervisorReview: boolean) => Promise<void>;
}) {
  const [notes, setNotes] = useState("");
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="fin-notes">Closing notes</Label>
        <Textarea id="fin-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={review} onCheckedChange={(v) => setReview(v === true)} />
        Send to a supervisor for review
      </label>
      <Button
        disabled={disabled || busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onFinalize(notes.trim(), review);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "This inspection could not be finalized.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
        Finalize inspection
      </Button>
      {disabled && (
        <p className="text-xs text-muted-foreground">Run the compliance check before finalizing.</p>
      )}
    </div>
  );
}

function ReportBlock({
  inspectionId,
  disabled,
  existing,
  onGenerate,
}: {
  inspectionId: string;
  disabled: boolean;
  existing: { id: string; report_code: string; checksum: string; payload: unknown; created_at: string }[];
  onGenerate: () => Promise<{ report: { report_code: string; checksum: string }; payload: unknown }>;
}) {
  const [busy, setBusy] = useState(false);

  function download(payload: unknown, meta: { report_code: string; checksum: string }) {
    const doc = buildReportPdf(payload as never, meta);
    doc.save(`${meta.report_code}.pdf`);
  }

  return (
    <div className="space-y-3">
      <Button
        variant="outline"
        disabled={disabled || busy}
        onClick={async () => {
          setBusy(true);
          try {
            const res = await onGenerate();
            download(res.payload, res.report);
            toast.success("Report generated and downloaded.");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "The report could not be generated.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileDown className="mr-2 size-4" />}
        Generate PDF report
      </Button>
      {existing.length > 0 && (
        <ul className="divide-y divide-border text-sm">
          {existing.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs">{r.report_code}</p>
                <p className="text-xs text-muted-foreground">
                  checksum {r.checksum.slice(0, 16)}… · {new Date(r.created_at).toLocaleString()}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  download(r.payload, { report_code: r.report_code, checksum: r.checksum })
                }
              >
                <FileDown className="mr-2 size-4" /> Download
              </Button>
            </li>
          ))}
        </ul>
      )}
      {disabled && <p className="text-xs text-muted-foreground">A compliance check is required first.</p>}
    </div>
  );
}
