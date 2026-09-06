import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MessageSquareWarning, MapPin } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { updateComplaintStatus } from "@/lib/complaints.functions";
import { LocationMap } from "@/components/location-map";
import { ComplaintTimeline } from "@/components/complaint-timeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/complaints")({
  head: () => ({
    meta: [
      { title: "Complaints — SCANOVA-AI" },
      {
        name: "description",
        content: "Report a suspected non-compliant package and follow what happens to it.",
      },
      { property: "og:title", content: "Complaints — SCANOVA-AI" },
      { property: "og:description", content: "Citizen complaints about packaged commodity labelling." },
    ],
  }),
  component: Complaints,
});

const BUCKET = "complaint-evidence";
const STATUSES = [
  "submitted",
  "under_review",
  "assigned",
  "investigation",
  "resolved",
  "rejected",
  "closed",
] as const;

function code() {
  const d = new Date();
  return `CMP-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${Math.random()
    .toString(36)
    .slice(2, 7)
    .toUpperCase()}`;
}

function Complaints() {
  const { user, isGovStaff } = useAuth();
  const queryClient = useQueryClient();
  const changeStatus = useServerFn(updateComplaintStatus);
  const [productName, setProductName] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [barcode, setBarcode] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Try to pick up the location straight away so the reporter sees the map.
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {
        /* declined — the button below lets them try again */
      },
      { timeout: 8000 },
    );
  }, []);

  const list = useQuery({
    queryKey: ["complaints", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("complaints")
        .select(
          "id, complaint_code, product_name, manufacturer_name, description, status, resolution_note, created_at, latitude, longitude, region, inspection_id",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });


  const submit = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("You are not signed in.");
      if (!productName.trim()) throw new Error("Please name the product.");
      if (description.trim().length < 10)
        throw new Error("Please describe the problem in a little more detail.");

      let imagePath: string | null = null;
      if (file) {
        if (file.size > 15 * 1024 * 1024) throw new Error("The photo must be smaller than 15 MB.");
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { contentType: file.type });
        if (upErr) throw new Error(upErr.message);
        imagePath = path;
      }

      const { error } = await supabase.from("complaints").insert({
        complaint_code: code(),
        complainant_id: user.id,
        product_name: productName.trim(),
        manufacturer_name: manufacturer.trim() || null,
        barcode: barcode.trim() || null,
        description: description.trim(),
        image_path: imagePath,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
        status: "submitted",
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Complaint submitted. You can follow its status below.");
      setProductName("");
      setManufacturer("");
      setBarcode("");
      setDescription("");
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ["complaints"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: (input: { id: string; status: string }) =>
      changeStatus({ data: { complaintId: input.id, status: input.status as never } }),
    onSuccess: () => {
      toast.success("Complaint updated — the reporter can see this step.");
      queryClient.invalidateQueries({ queryKey: ["complaints"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Complaints</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Report a package whose declarations look wrong or missing. Officers see it in their queue.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Report a package</CardTitle>
            <CardDescription>Photograph the label if you can — it helps the inspector.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="c-p">Product</Label>
              <Input id="c-p" value={productName} onChange={(e) => setProductName(e.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="c-m">Manufacturer / brand</Label>
                <Input id="c-m" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="c-b">Barcode</Label>
                <Input id="c-b" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-d">What is wrong?</Label>
              <Textarea
                id="c-d"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. no MRP printed, net quantity unreadable, no manufacturer address"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-f">Photo of the label (optional)</Label>
              <Input
                id="c-f"
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (!("geolocation" in navigator)) {
                  toast.error("This device does not report a location.");
                  return;
                }
                navigator.geolocation.getCurrentPosition(
                  (p) => {
                    setCoords({ lat: p.coords.latitude, lng: p.coords.longitude });
                    toast.success("Location attached.");
                  },
                  () => toast.error("Location permission was declined."),
                );
              }}
            >
              <MapPin className="mr-2 size-4" />
              {coords ? "Update my location" : "Attach my location"}
            </Button>
            <LocationMap
              latitude={coords?.lat ?? null}
              longitude={coords?.lng ?? null}
              label="Where you found the package"
            />
            <Button className="w-full" onClick={() => submit.mutate()} disabled={submit.isPending}>
              {submit.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <MessageSquareWarning className="mr-2 size-4" />
              )}
              Submit complaint
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Complaint queue</CardTitle>
            <CardDescription>
              {isGovStaff ? "Complaints for your authority." : "Complaints you have submitted."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {list.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (list.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing here yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {(list.data ?? []).map((c) => (
                  <li key={c.id} className="space-y-1.5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="flex-1 text-sm font-medium">{c.product_name}</p>
                      {isGovStaff ? (
                        <Select
                          value={c.status}
                          onValueChange={(v) => updateStatus.mutate({ id: c.id, status: v })}
                        >
                          <SelectTrigger className="h-8 w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUSES.map((s) => (
                              <SelectItem key={s} value={s} className="capitalize">
                                {s.replace(/_/g, " ")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="secondary" className="capitalize">
                          {c.status.replace(/_/g, " ")}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {c.complaint_code} · {new Date(c.created_at).toLocaleString()}
                    </p>
                    <p className="text-sm text-muted-foreground">{c.description}</p>
                    {c.resolution_note && (
                      <p className="text-sm">
                        <span className="font-medium">Outcome: </span>
                        {c.resolution_note}
                      </p>
                    )}
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
