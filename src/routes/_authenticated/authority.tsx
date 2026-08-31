import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, Users } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CATEGORY_LABELS, ROLE_LABELS, OVERALL_LABELS } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/authority")({
  head: () => ({
    meta: [
      { title: "Authority — SCANOVA-AI" },
      {
        name: "description",
        content: "Authority offices, members and compliance analytics across your inspections.",
      },
      { property: "og:title", content: "Authority — SCANOVA-AI" },
      { property: "og:description", content: "Authority-level oversight and analytics in SCANOVA-AI." },
    ],
  }),
  component: AuthorityView;
});

const COLORS = ["#1f9d55", "#c0392b", "#d68910", "#2471a3", "#7f8c8d"];

function AuthorityView() {
  const authority = useQuery({
    queryKey: ["authority", "mine"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("authorities")
        .select("id, name, code, state, contact_email, is_demo")
        .limit(5);
      if (error) throw error;
      return data;
    },
  });

  const offices = useQuery({
    queryKey: ["offices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("offices").select("id, name, district, state");
      if (error) throw error;
      return data;
    },
  });

  const members = useQuery({
    queryKey: ["authority-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("authority_members")
        .select("id, user_id, member_role, is_active");
      if (error) throw error;
      return data;
    },
  });

  const inspections = useQuery({
    queryKey: ["inspections", "analytics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspections")
        .select("id, category, result, status, created_at")
        .limit(1000);
      if (error) throw error;
      return data;
    },
  });

  const rows = inspections.data ?? [];
  const byResult = Object.entries(
    rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.result] = (acc[r.result] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([key, value]) => ({ name: OVERALL_LABELS[key] ?? key, value }));

  const byCategory = Object.entries(
    rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.category] = (acc[r.category] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .map(([key, value]) => ({ name: CATEGORY_LABELS[key] ?? key, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Authority</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Offices, members and analytics for the records your authority can see.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Authority</CardTitle>
            <CardDescription>Your authority and its offices.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {authority.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : (authority.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No authority record is linked to your account.</p>
            ) : (
              (authority.data ?? []).map((a) => (
                <div key={a.id} className="rounded-md border border-border p-3">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <Building2 className="size-4 text-accent" />
                    {a.name}
                    {a.is_demo && (
                      <Badge variant="outline" className="text-[10px] uppercase">
                        demo
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {a.code}
                    {a.state ? ` · ${a.state}` : ""}
                    {a.contact_email ? ` · ${a.contact_email}` : ""}
                  </p>
                </div>
              ))
            )}
            <div>
              <p className="text-sm font-medium">Offices</p>
              {offices.isLoading ? (
                <Skeleton className="mt-2 h-12 w-full" />
              ) : (
                <ul className="mt-1 text-sm text-muted-foreground">
                  {(offices.data ?? []).map((o) => (
                    <li key={o.id}>
                      {o.name}
                      {o.district ? ` — ${o.district}` : ""}
                      {o.state ? `, ${o.state}` : ""}
                    </li>
                  ))}
                  {(offices.data ?? []).length === 0 && <li>No offices recorded.</li>}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Members</CardTitle>
            <CardDescription>Staff attached to your authority.</CardDescription>
          </CardHeader>
          <CardContent>
            {members.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : (members.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No members recorded.</p>
            ) : (
              <ul className="divide-y divide-border">
                {(members.data ?? []).map((m) => (
                  <li key={m.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <Users className="size-4 text-muted-foreground" />
                    <span className="flex-1 font-mono text-xs">{m.user_id.slice(0, 8)}…</span>
                    <Badge variant="secondary">{ROLE_LABELS[m.member_role] ?? m.member_role}</Badge>
                    {!m.is_active && <Badge variant="outline">inactive</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Outcomes</CardTitle>
            <CardDescription>Distribution of inspection results.</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {byResult.length === 0 ? (
              <p className="text-sm text-muted-foreground">No inspections yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byResult} dataKey="value" nameKey="name" outerRadius={90} label>
                    {byResult.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Inspections by commodity</CardTitle>
            <CardDescription>Most inspected categories.</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {byCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground">No inspections yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byCategory}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} height={60} dy={10} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#2471a3" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
