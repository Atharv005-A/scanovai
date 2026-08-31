import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIES } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/inspections/new")({
  head: () => ({
    meta: [
      { title: "New inspection — SCANOVA-AI" },
      { name: "description", content: "Start a new packaged commodity compliance inspection." },
      { property: "og:title", content: "New inspection — SCANOVA-AI" },
      { property: "og:description", content: "Record package details and begin an inspection." },
    ],
  }),
  component: NewInspection,
});

function refCode() {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `INS-${stamp}-${rand}`;
}

function NewInspection() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [category, setCategory] = useState("other");
  const [productName, setProductName] = useState("");
  const [manufacturerName, setManufacturerName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("You are not signed in.");
      const { data: member } = await supabase
        .from("authority_members")
        .select("authority_id, office_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();

      const { data, error } = await supabase
        .from("inspections")
        .insert({
          reference_code: refCode(),
          inspector_id: user.id,
          authority_id: member?.authority_id ?? null,
          office_id: member?.office_id ?? null,
          category,
          product_name: productName.trim() || null,
          manufacturer_name: manufacturerName.trim() || null,
          barcode: barcode.trim() || null,
          location_label: locationLabel.trim() || null,
          latitude: coords?.lat ?? null,
          longitude: coords?.lng ?? null,
          inspector_notes: notes.trim() || null,
          status: "draft",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return data.id as string;
    },
    onSuccess: (id) => {
      toast.success("Inspection created. Capture the package images next.");
      navigate({ to: "/inspections/$id", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function useLocation() {
    if (!("geolocation" in navigator)) {
      toast.error("This device does not report a location.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        toast.success("Location attached to this inspection.");
      },
      () => toast.error("Location permission was declined. You can type the place instead."),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New inspection</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Record what you are inspecting. Everything here can be corrected later, and the label images decide
          the declarations.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Package details</CardTitle>
          <CardDescription>Only the commodity category is required to begin.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Commodity category</Label>
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
            <p className="text-xs text-muted-foreground">
              The category decides which schedule-based checks apply.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pn">Product name</Label>
              <Input
                id="pn"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="e.g. Cream Biscuits 100 g"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mn">Manufacturer / packer</Label>
              <Input
                id="mn"
                value={manufacturerName}
                onChange={(e) => setManufacturerName(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bc">Barcode (optional)</Label>
            <Input
              id="bc"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="Type it, or scan it on the next screen"
            />
            <p className="text-xs text-muted-foreground">
              A barcode is supplementary evidence only. If a linked record disagrees with the package, the
              conflict is flagged rather than the package being overwritten.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="loc">Place of inspection</Label>
            <div className="flex gap-2">
              <Input
                id="loc"
                value={locationLabel}
                onChange={(e) => setLocationLabel(e.target.value)}
                placeholder="Shop, market or premises"
              />
              <Button type="button" variant="outline" onClick={useLocation}>
                <MapPin className="mr-2 size-4" />
                {coords ? "Attached" : "Use GPS"}
              </Button>
            </div>
            {coords && (
              <p className="text-xs text-muted-foreground">
                {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Inspector notes</Label>
            <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <Button className="w-full" onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Create and capture images
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
