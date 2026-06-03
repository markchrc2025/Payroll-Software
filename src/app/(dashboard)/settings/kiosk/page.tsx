"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Monitor, Copy, Check, Eye, EyeOff, Link2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type Branch = { id: string; name: string };

type Kiosk = {
  id: string;
  name: string;
  deviceToken: string;
  requiresSelfie: boolean;
  isActive: boolean;
  lastSeenAt: string | null;
  branch: { id: string; name: string } | null;
};

const EMPTY_FORM = {
  name: "",
  branchId: "__none__",
  requiresSelfie: true,
  isActive: true,
};

export default function KiosksPage() {
  const [kiosks, setKiosks] = useState<Kiosk[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Kiosk | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // New-kiosk token reveal dialog
  const [tokenDialog, setTokenDialog] = useState(false);
  const [newToken, setNewToken] = useState("");
  const [newKioskName, setNewKioskName] = useState("");
  const [tokenCopied, setTokenCopied] = useState(false);

  // Per-row token reveal state
  const [revealedTokens, setRevealedTokens] = useState<Set<string>>(new Set());

  // Regenerate token state
  const [regenKiosk, setRegenKiosk] = useState<Kiosk | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  async function load() {
    setIsLoading(true);
    const [kiosksRes, branchesRes] = await Promise.all([
      fetch("/api/kiosks?limit=100"),
      fetch("/api/branches"),
    ]);
    const kiosksJson = await kiosksRes.json();
    const branchesJson = await branchesRes.json();
    setKiosks(kiosksJson.data ?? []);
    setBranches(branchesJson.data ?? []);
    setIsLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setSheetOpen(true);
    setTimeout(() => nameRef.current?.focus(), 50);
  }

  function openEdit(kiosk: Kiosk) {
    setEditing(kiosk);
    setForm({
      name: kiosk.name,
      branchId: kiosk.branch?.id ?? "__none__",
      requiresSelfie: kiosk.requiresSelfie,
      isActive: kiosk.isActive,
    });
    setSheetOpen(true);
    setTimeout(() => nameRef.current?.focus(), 50);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        branchId: form.branchId === "__none__" ? null : form.branchId,
        requiresSelfie: form.requiresSelfie,
        isActive: form.isActive,
      };

      const url = editing ? `/api/kiosks/${editing.id}` : "/api/kiosks";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Failed to save kiosk");
        return;
      }

      if (!editing) {
        // Show the device token once on creation
        const token: string = json.data?.deviceToken ?? "";
        const name: string = json.data?.name ?? form.name.trim();
        setNewToken(token);
        setNewKioskName(name);
        setTokenCopied(false);
        setTokenDialog(true);
      } else {
        toast.success("Kiosk updated");
      }

      setSheetOpen(false);
      load();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(kiosk: Kiosk) {
    const res = await fetch(`/api/kiosks/${kiosk.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Kiosk deleted");
      load();
    } else {
      const json = await res.json().catch(() => null);
      toast.error(json?.error ?? "Failed to delete kiosk");
    }
  }

  async function toggleActive(kiosk: Kiosk) {
    const res = await fetch(`/api/kiosks/${kiosk.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !kiosk.isActive }),
    });
    if (res.ok) {
      toast.success(kiosk.isActive ? "Kiosk deactivated" : "Kiosk activated");
      load();
    } else {
      toast.error("Failed to update kiosk");
    }
  }

  const copySetupLink = useCallback(async (token: string) => {
    try {
      const link = `${window.location.origin}/remotekiosk/setup?token=${token}`;
      await navigator.clipboard.writeText(link);
      toast.success("Setup link copied to clipboard");
    } catch {
      toast.error("Failed to copy — please copy manually");
    }
  }, []);

  async function handleRegenerate() {
    if (!regenKiosk) return;
    setRegenerating(true);
    try {
      const res = await fetch(`/api/kiosks/${regenKiosk.id}/regenerate-token`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Failed to regenerate token");
        return;
      }
      const newDeviceToken: string = json.data?.deviceToken ?? "";
      setKiosks((prev) =>
        prev.map((k) => k.id === regenKiosk.id ? { ...k, deviceToken: newDeviceToken } : k)
      );
      setRegenKiosk(null);
      setNewToken(newDeviceToken);
      setNewKioskName(regenKiosk.name);
      setTokenCopied(false);
      setTokenDialog(true);
    } finally {
      setRegenerating(false);
    }
  }

  const copyToken = useCallback(async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    } catch {
      toast.error("Failed to copy — please copy manually");
    }
  }, []);

  function toggleReveal(id: string) {
    setRevealedTokens((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function maskToken(token: string) {
    return token.slice(0, 8) + "••••••••••••••••";
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Kiosks</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading ? "Loading…" : `${kiosks.length} kiosk${kiosks.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button size="sm" onClick={openAdd}>
          <Plus className="mr-2 h-4 w-4" />
          Add Kiosk
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead className="text-center">Selfie</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead>Last Seen</TableHead>
              <TableHead>Device Token</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : kiosks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                  <Monitor className="mx-auto mb-2 h-8 w-8 opacity-30" />
                  No kiosks yet. Add one to get started.
                </TableCell>
              </TableRow>
            ) : (
              kiosks.map((kiosk) => {
                const revealed = revealedTokens.has(kiosk.id);
                return (
                  <TableRow key={kiosk.id}>
                    <TableCell className="font-medium">{kiosk.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {kiosk.branch?.name ?? <span className="italic opacity-40">—</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="default" className="text-xs">Required</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {kiosk.isActive
                        ? <Badge variant="default" className="bg-green-500 text-xs">Active</Badge>
                        : <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {kiosk.lastSeenAt
                        ? new Date(kiosk.lastSeenAt).toLocaleString("en-PH", { dateStyle: "short", timeStyle: "short" })
                        : <span className="italic opacity-40">Never</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <code className="text-xs font-mono text-muted-foreground">
                          {revealed ? kiosk.deviceToken : maskToken(kiosk.deviceToken)}
                        </code>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 shrink-0"
                          title={revealed ? "Hide token" : "Reveal token"}
                          onClick={() => toggleReveal(kiosk.id)}
                        >
                          {revealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 shrink-0"
                          title="Copy token"
                          onClick={() => copyToken(kiosk.deviceToken)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 shrink-0"
                          title="Copy setup link"
                          onClick={() => copySetupLink(kiosk.deviceToken)}
                        >
                          <Link2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title="Edit"
                          onClick={() => openEdit(kiosk)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title={kiosk.isActive ? "Deactivate" : "Activate"}
                          onClick={() => toggleActive(kiosk)}
                        >
                          <Monitor className={`h-3.5 w-3.5 ${kiosk.isActive ? "text-green-600" : "text-muted-foreground"}`} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title="Regenerate token"
                          onClick={() => setRegenKiosk(kiosk)}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          title="Delete"
                          onClick={() => handleDelete(kiosk)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add / Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editing ? "Edit Kiosk" : "Add Kiosk"}</SheetTitle>
            <SheetDescription>
              {editing
                ? "Update this kiosk's settings."
                : "Create a new kiosk device. You'll receive a device token to pair the terminal."}
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="kiosk-name">Name <span className="text-destructive">*</span></Label>
              <Input
                id="kiosk-name"
                ref={nameRef}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Makati Lobby Terminal"
                required
                maxLength={150}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kiosk-branch">Branch</Label>
              <Select
                value={form.branchId}
                onValueChange={(v) => setForm((f) => ({ ...f, branchId: v ?? f.branchId }))}
              >
                <SelectTrigger id="kiosk-branch">
                  <SelectValue placeholder="No branch assigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No branch assigned</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <Checkbox
                id="kiosk-active"
                checked={form.isActive}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: Boolean(v) }))}
              />
              <div>
                <Label htmlFor="kiosk-active" className="cursor-pointer font-medium">Active</Label>
                <p className="text-xs text-muted-foreground">Inactive kiosks reject all punch attempts</p>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={submitting} className="flex-1">
                {submitting ? "Saving…" : editing ? "Save Changes" : "Create Kiosk"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setSheetOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Regenerate Token Confirm Dialog */}
      <Dialog open={!!regenKiosk} onOpenChange={(open) => { if (!open) setRegenKiosk(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Regenerate Device Token?</DialogTitle>
            <DialogDescription>
              This will immediately invalidate the current token for{" "}
              <strong>{regenKiosk?.name}</strong>. Any paired device will stop working until re-paired with the new token.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 pt-2">
            <Button
              className="flex-1"
              variant="destructive"
              disabled={regenerating}
              onClick={handleRegenerate}
            >
              {regenerating ? "Regenerating…" : "Yes, Regenerate"}
            </Button>
            <Button variant="outline" onClick={() => setRegenKiosk(null)} disabled={regenerating}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Device Token Dialog — shown once on creation or after regeneration */}
      <Dialog open={tokenDialog} onOpenChange={setTokenDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5 text-sky-600" />
              Kiosk Created
            </DialogTitle>
            <DialogDescription>
              <strong>{newKioskName}</strong> has been created. Copy the device token below and paste it at{" "}
              <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">/remotekiosk/setup</code>{" "}
              on the tablet or terminal to pair the device.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-muted p-4">
              <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Device Token</p>
              <code className="block text-sm font-mono break-all leading-relaxed">{newToken}</code>
            </div>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
              Save this token now — you can reveal it again from the Kiosks table at any time.
            </p>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() => copyToken(newToken)}
              >
                {tokenCopied ? (
                  <><Check className="mr-2 h-4 w-4" />Copied!</>
                ) : (
                  <><Copy className="mr-2 h-4 w-4" />Copy Token</>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => copySetupLink(newToken)}
              >
                <Link2 className="mr-2 h-4 w-4" />Copy Setup Link
              </Button>
              <Button variant="outline" onClick={() => setTokenDialog(false)}>
                Done
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
