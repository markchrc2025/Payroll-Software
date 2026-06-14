"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type QuickCreateEntity = "position" | "department" | "branch";

export type CreatedRecord = { id: string; title?: string; name?: string };

type Props = {
  entity: QuickCreateEntity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (record: CreatedRecord) => void;
};

const ENTITY_META: Record<QuickCreateEntity, { label: string; endpoint: string; nameLabel: string; placeholder: string }> = {
  position:   { label: "Position",   endpoint: "/api/positions",   nameLabel: "Title", placeholder: "e.g. Senior Engineer" },
  department: { label: "Department", endpoint: "/api/departments", nameLabel: "Name",  placeholder: "e.g. Engineering" },
  branch:     { label: "Branch",     endpoint: "/api/branches",    nameLabel: "Name",  placeholder: "e.g. Makati HQ" },
};

const POSITION_LEVELS = ["ENTRY", "MID", "SENIOR", "MANAGER", "DIRECTOR", "EXECUTIVE"];

/**
 * Minimal nested dialog to create a Position / Department / Branch without
 * leaving the New Movement modal. POSTs to the existing entity API and hands
 * the created record back to the caller.
 */
export function QuickCreateDialog({ entity, open, onOpenChange, onCreated }: Props) {
  const meta = ENTITY_META[entity];
  const [name, setName] = useState("");
  const [level, setLevel] = useState("MID");
  const [saving, setSaving] = useState(false);

  function reset() {
    setName("");
    setLevel("MID");
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error(`${meta.nameLabel} is required`);
      return;
    }
    setSaving(true);
    const payload: Record<string, unknown> =
      entity === "position" ? { title: name.trim(), level } : { name: name.trim() };
    const res = await fetch(meta.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      toast.error(json.error ?? `Failed to create ${meta.label.toLowerCase()}`);
      return;
    }
    toast.success(`${meta.label} created`);
    onCreated(json.data as CreatedRecord);
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New {meta.label}</DialogTitle>
          <DialogDescription>Create a {meta.label.toLowerCase()} without leaving the movement form.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>
              {meta.nameLabel} <span className="text-primary">*</span>
            </Label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={meta.placeholder}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSave();
                }
              }}
            />
          </div>

          {entity === "position" && (
            <div className="space-y-1.5">
              <Label>Level</Label>
              <Select value={level} onValueChange={(v) => setLevel(v ?? "MID")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POSITION_LEVELS.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l.charAt(0) + l.slice(1).toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Creating…" : `Create ${meta.label}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
