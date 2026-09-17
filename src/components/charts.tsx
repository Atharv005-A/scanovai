/**
 * Shared chart presentation for every dashboard.
 *
 * All colours come from the semantic tokens in src/styles.css so the charts
 * follow the theme (including dark mode) instead of hardcoded hex values.
 */
import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Skeleton } from "@/components/ui/skeleton";

const AXIS = { fontSize: 11, fill: "var(--muted-foreground)" } as const;
const GRID = "var(--border)";

const tooltipStyle = {
  contentStyle: {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 12,
    color: "var(--popover-foreground)",
    boxShadow: "0 8px 24px -12px rgb(0 0 0 / 0.35)",
  },
  labelStyle: { color: "var(--muted-foreground)", fontSize: 11, marginBottom: 2 },
  itemStyle: { padding: "1px 0" },
} as const;

/** Card body wrapper: fixed height, loading skeleton, honest empty state. */
export function ChartFrame({
  loading,
  empty,
  emptyText,
  height = "h-72",
  bare,
  children,
}: {
  loading?: boolean;
  empty?: boolean;
  emptyText: string;
  height?: string;
  /** Set when the child manages its own sizing (e.g. OutcomeDonut). */
  bare?: boolean;
  children: ReactNode;
}) {
  if (loading) return <Skeleton className={`${height} w-full`} />;
  if (empty)
    return (
      <div
        className={`${height} flex items-center justify-center rounded-lg border border-dashed border-border bg-muted/20`}
      >
        <p className="px-4 text-center text-sm text-muted-foreground">{emptyText}</p>
      </div>
    );
  return (
    <div className={`${height} w-full`}>
      <ResponsiveContainer width="100%" height="100%">
        {children as never}
      </ResponsiveContainer>
    </div>
  );
}

export interface TrendSeries {
  key: string;
  name: string;
  color: string;
}

/** Smooth, softly filled trend over a date axis. */
export function TrendArea({
  data,
  series,
  xKey = "date",
}: {
  data: Record<string, any>[];
  series: TrendSeries[];
  xKey?: string;
}) {
  return (
    <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
      <defs>
        {series.map((s) => (
          <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
          </linearGradient>
        ))}
      </defs>
      <CartesianGrid strokeDasharray="2 6" stroke={GRID} vertical={false} />
      <XAxis
        dataKey={xKey}
        tick={AXIS}
        tickLine={false}
        axisLine={{ stroke: GRID }}
        minTickGap={22}
        tickFormatter={(v: string) => shortDate(v)}
      />
      <YAxis
        allowDecimals={false}
        tick={AXIS}
        tickLine={false}
        axisLine={false}
        width={32}
      />
      <Tooltip {...tooltipStyle} labelFormatter={(v) => shortDate(String(v), true)} />
      <Legend
        verticalAlign="top"
        height={28}
        iconType="circle"
        iconSize={8}
        wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }}
      />
      {series.map((s) => (
        <Area
          key={s.key}
          type="monotone"
          dataKey={s.key}
          name={s.name}
          stroke={s.color}
          strokeWidth={2}
          fill={`url(#fill-${s.key})`}
          activeDot={{ r: 4, strokeWidth: 0 }}
          dot={false}
        />
      ))}
    </AreaChart>
  );
}

/** Horizontal ranked bars with full labels and a value at the end of each bar. */
export function RankedBars({
  data,
  valueKey = "value",
  labelKey = "label",
  name,
  color = "var(--chart-4)",
  labelWidth = 168,
}: {
  data: Record<string, any>[];
  valueKey?: string;
  labelKey?: string;
  name: string;
  color?: string;
  labelWidth?: number;
}) {
  return (
    <BarChart data={data} layout="vertical" margin={{ top: 4, right: 34, left: 0, bottom: 4 }}>
      <CartesianGrid strokeDasharray="2 6" stroke={GRID} horizontal={false} />
      <XAxis type="number" allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
      <YAxis
        type="category"
        dataKey={labelKey}
        width={labelWidth}
        tick={AXIS}
        tickLine={false}
        axisLine={false}
        tickFormatter={(v: string) => (v.length > 30 ? `${v.slice(0, 29)}…` : v)}
      />
      <Tooltip {...tooltipStyle} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
      <Bar dataKey={valueKey} name={name} fill={color} radius={[0, 6, 6, 0]} barSize={16}>
        <LabelList
          dataKey={valueKey}
          position="right"
          style={{ fill: "var(--muted-foreground)", fontSize: 11 }}
        />
      </Bar>
    </BarChart>
  );
}

/** Vertical bars for category-style breakdowns. */
export function CategoryBars({
  data,
  valueKey = "value",
  labelKey = "label",
  name,
  color = "var(--chart-4)",
}: {
  data: Record<string, any>[];
  valueKey?: string;
  labelKey?: string;
  name: string;
  color?: string;
}) {
  return (
    <BarChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 28 }}>
      <CartesianGrid strokeDasharray="2 6" stroke={GRID} vertical={false} />
      <XAxis
        dataKey={labelKey}
        tick={{ ...AXIS, fontSize: 10 }}
        tickLine={false}
        axisLine={{ stroke: GRID }}
        interval={0}
        angle={-18}
        textAnchor="end"
        height={44}
        tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)}
      />
      <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} width={30} />
      <Tooltip {...tooltipStyle} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
      <Bar dataKey={valueKey} name={name} fill={color} radius={[6, 6, 0, 0]} maxBarSize={44}>
        <LabelList
          dataKey={valueKey}
          position="top"
          style={{ fill: "var(--muted-foreground)", fontSize: 11 }}
        />
      </Bar>
    </BarChart>
  );
}

export const OUTCOME_COLORS: Record<string, string> = {
  compliant: "var(--success)",
  non_compliant: "var(--destructive)",
  needs_review: "var(--warning)",
  partially_compliant: "var(--warning)",
  unable_to_determine: "var(--chart-5)",
  pending: "var(--chart-5)",
};

/** Donut with the total in the middle and a legend carrying counts and shares. */
export function OutcomeDonut({
  data,
  totalLabel = "checks",
}: {
  data: { key: string; label: string; value: number }[];
  totalLabel?: string;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  return (
    <div className="flex h-full flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative h-40 flex-1 sm:h-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius="58%"
              outerRadius="86%"
              paddingAngle={2}
              stroke="var(--card)"
              strokeWidth={2}
            >
              {data.map((d) => (
                <Cell key={d.key} fill={OUTCOME_COLORS[d.key] ?? "var(--chart-4)"} />
              ))}
            </Pie>
            <Tooltip {...tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold">{total}</span>
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{totalLabel}</span>
        </div>
      </div>
      <ul className="space-y-1.5 sm:w-44">
        {data.map((d) => (
          <li key={d.key} className="flex items-center gap-2 text-xs">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: OUTCOME_COLORS[d.key] ?? "var(--chart-4)" }}
            />
            <span className="flex-1 truncate text-muted-foreground">{d.label}</span>
            <span className="font-medium">{d.value}</span>
            <span className="w-9 text-right text-muted-foreground">
              {total ? Math.round((d.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function shortDate(value: string, long = false) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN",
    long ? { day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short" },
  );
}
