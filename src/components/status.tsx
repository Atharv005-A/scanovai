import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { RESULT_LABELS, OVERALL_LABELS, type CheckResult } from "@/lib/domain";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MinusCircle,
  HelpCircle,
  UserCheck,
} from "lucide-react";

const RESULT_STYLE: Record<CheckResult, { cls: string; Icon: typeof CheckCircle2 }> = {
  pass: { cls: "bg-success/12 text-success border-success/30", Icon: CheckCircle2 },
  fail: { cls: "bg-destructive/12 text-destructive border-destructive/30", Icon: XCircle },
  needs_review: { cls: "bg-warning/15 text-warning-foreground border-warning/40", Icon: AlertTriangle },
  not_applicable: { cls: "bg-muted text-muted-foreground border-border", Icon: MinusCircle },
  unable_to_verify: { cls: "bg-info/12 text-info border-info/30", Icon: HelpCircle },
  manual_verification_required: {
    cls: "bg-accent/20 text-accent-foreground border-accent/40",
    Icon: UserCheck,
  },
};

export function ResultBadge({ result, className }: { result: CheckResult; className?: string }) {
  const style = RESULT_STYLE[result] ?? RESULT_STYLE.not_applicable;
  const Icon = style.Icon;
  return (
    <Badge variant="outline" className={cn("gap-1 font-medium", style.cls, className)}>
      <Icon className="size-3.5" />
      {RESULT_LABELS[result] ?? result}
    </Badge>
  );
}

const OVERALL_STYLE: Record<string, string> = {
  compliant: "bg-success/12 text-success border-success/30",
  non_compliant: "bg-destructive/12 text-destructive border-destructive/30",
  needs_review: "bg-warning/15 text-warning-foreground border-warning/40",
  unable_to_verify: "bg-info/12 text-info border-info/30",
  pending: "bg-muted text-muted-foreground border-border",
};

export function OverallBadge({ result, className }: { result: string; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("font-semibold uppercase tracking-wide", OVERALL_STYLE[result], className)}
    >
      {OVERALL_LABELS[result] ?? result}
    </Badge>
  );
}

export function ConfidenceChip({ value }: { value: number }) {
  if (value <= 0) return <span className="text-xs text-muted-foreground">not read</span>;
  const pct = Math.round(value * 100);
  const cls =
    value >= 0.85
      ? "text-success"
      : value >= 0.6
        ? "text-warning-foreground"
        : "text-destructive";
  return <span className={cn("text-xs font-medium", cls)}>{pct}% confidence</span>;
}

export function StatusDot({ status }: { status: string }) {
  const map: Record<string, string> = {
    synced: "bg-success",
    pending: "bg-warning",
    processing: "bg-info",
    failed: "bg-destructive",
  };
  return <span className={cn("inline-block size-2 rounded-full", map[status] ?? "bg-muted")} />;
}
