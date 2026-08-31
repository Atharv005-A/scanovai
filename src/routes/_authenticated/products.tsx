import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Package, Plus } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIES, CATEGORY_LABELS } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({
    meta: [
      { title: "My products — SCANOVA-AI" },
      {
        name: "description",
        content: "Maintain your declared product catalogue so inspections can cross-check the label.",
      },
      { property: "og:title", content: "My products — SCANOVA-AI" },
      { property: "og:description", content: "Manufacturer product catalogue in SCANOVA-AI." },
    ],
  }),
  component: Products,
});

function Products() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("other");
  const [barcode, setBarcode] = useState("");
  const [mrp, setMrp] = useState("");
  const [qty, setQty] = useState("");

  const manufacturer = useQuery({
    queryKey: ["manufacturer", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manufacturers")
        .select("id, name")
        .eq("owner_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const products = useQuery({
    queryKey: ["products", manufacturer.data?.id],
    enabled: !!manufacturer.data?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, category, barcode, declared_mrp, declared_net_quantity, created_at")
        .eq("manufacturer_id", manufacturer.data!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!manufacturer.data?.id)
        throw new Error("Your manufacturer profile is not ready yet. Refresh the page and try again.");
      if (!name.trim()) throw new Error("Please give the product a name.");
      const { error } = await supabase.from("products").insert({
        manufacturer_id: manufacturer.data.id,
        name: name.trim(),
        category,
        barcode: barcode.trim() || null,
        declared_mrp: mrp.trim() ? Number(mrp) : null,
        declared_net_quantity: qty.trim() || null,
        created_by: user?.id ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Product added to your catalogue.");
      setName("");
      setBarcode("");
      setMrp("");
      setQty("");
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">My products</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {manufacturer.data?.name
            ? `Catalogue for ${manufacturer.data.name}.`
            : "Your declared products. A barcode lets an inspection cross-check the printed label."}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Add a product</CardTitle>
            <CardDescription>
              Declared values are only used to detect conflicts. They never replace what is printed on the
              package.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="p-n">Product name</Label>
              <Input id="p-n" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="p-b">Barcode</Label>
                <Input id="p-b" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-m">Declared MRP (Rs)</Label>
                <Input
                  id="p-m"
                  type="number"
                  inputMode="decimal"
                  value={mrp}
                  onChange={(e) => setMrp(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-q">Net quantity</Label>
                <Input
                  id="p-q"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  placeholder="e.g. 500 g"
                />
              </div>
            </div>
            <Button className="w-full" onClick={() => add.mutate()} disabled={add.isPending}>
              {add.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Plus className="mr-2 size-4" />
              )}
              Add product
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Catalogue</CardTitle>
            <CardDescription>Products you have declared.</CardDescription>
          </CardHeader>
          <CardContent>
            {products.isLoading || manufacturer.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (products.data ?? []).length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-6 text-center">
                <Package className="mx-auto size-6 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">No products yet.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {(products.data ?? []).map((p) => (
                  <li key={p.id} className="py-3">
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {CATEGORY_LABELS[p.category] ?? p.category}
                      {p.barcode ? ` · ${p.barcode}` : ""}
                      {p.declared_mrp ? ` · MRP Rs ${p.declared_mrp}` : ""}
                      {p.declared_net_quantity ? ` · ${p.declared_net_quantity}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
