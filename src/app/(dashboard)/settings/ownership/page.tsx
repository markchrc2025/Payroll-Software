"use client";

/**
 * /settings/ownership — Transfer Ownership
 * Shows the current tenant Super Admin and lets any Administrator transfer
 * that designation to another active user in the company.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Crown, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

type User = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  assignedRole: { name: string } | null;
};

type Owner = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
} | null;

type Data = {
  ownerUserId: string | null;
  owner: Owner;
  users: User[];
};

export default function OwnershipPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  // Transfer dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [confirm, setConfirm] = useState("");
  const [transferring, setTransferring] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/settings/ownership");
    if (res.ok) {
      const json = await res.json();
      setData(json.data);
    } else {
      toast.error("Failed to load ownership data");
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openDialog() {
    setSelectedUserId("");
    setConfirm("");
    setDialogOpen(true);
  }

  const eligibleUsers = (data?.users ?? []).filter((u) => u.id !== data?.ownerUserId);
  const selectedUser = data?.users.find((u) => u.id === selectedUserId) ?? null;
  const confirmText = selectedUser
    ? `${selectedUser.firstName} ${selectedUser.lastName}`.trim()
    : "";
  const canTransfer = selectedUserId && confirm === confirmText;

  async function handleTransfer() {
    if (!canTransfer) return;
    setTransferring(true);
    try {
      const res = await fetch("/api/settings/ownership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newOwnerUserId: selectedUserId }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Transfer failed");
        return;
      }
      toast.success("Ownership transferred successfully");
      setDialogOpen(false);
      await load();
    } finally {
      setTransferring(false);
    }
  }

  const ownerName = data?.owner
    ? `${data.owner.firstName} ${data.owner.lastName}`.trim() || data.owner.email
    : null;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold tracking-[-0.4px] text-[#111827] leading-tight">
            Ownership
          </h1>
          <p className="text-[13px] text-[#6B7A8D] mt-0.5">
            The Super Admin is the designated primary administrator of this account.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-9 text-[13px]">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Current owner card */}
          <div className="bg-white rounded-xl border border-[#E8EBF1] shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Crown className="h-4 w-4 text-[#E8693A]" />
              <h2 className="text-[14px] font-semibold text-[#111827]">Current Super Admin</h2>
            </div>
            {data?.owner ? (
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[#FDF0EA] text-[#E8693A] font-semibold text-[15px]">
                  {data.owner.firstName[0]}{data.owner.lastName[0]}
                </div>
                <div>
                  <p className="text-[14px] font-medium text-[#111827]">{ownerName}</p>
                  <p className="text-[13px] text-[#6B7A8D]">{data.owner.email}</p>
                </div>
                <span className="ml-auto text-[11px] font-medium bg-[#FDF0EA] text-[#E8693A] rounded-full px-2.5 py-1">
                  Super Admin
                </span>
              </div>
            ) : (
              <p className="text-[13px] text-[#9AA5B4]">No owner designated yet.</p>
            )}
          </div>

          {/* Transfer section */}
          <div className="bg-white rounded-xl border border-[#E8EBF1] shadow-sm p-5 space-y-4">
            <h2 className="text-[14px] font-semibold text-[#111827]">Transfer Ownership</h2>
            <p className="text-[13px] text-[#6B7A8D]">
              Transferring ownership designates another active user as the Super Admin of this account.
              You will retain your existing role and access after the transfer.
            </p>
            {eligibleUsers.length === 0 ? (
              <p className="text-[13px] text-[#9AA5B4]">
                No other active users available to transfer to.
              </p>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={openDialog}
                className="h-9 text-[13px] border-[#E8693A] text-[#E8693A] hover:bg-[#FDF0EA]"
              >
                Transfer Ownership
              </Button>
            )}
          </div>

          {/* Users list */}
          <div className="bg-white rounded-xl border border-[#E8EBF1] shadow-sm p-5 space-y-3">
            <h2 className="text-[14px] font-semibold text-[#111827]">All Active Users</h2>
            <div className="divide-y divide-[#F3F4F6]">
              {(data?.users ?? []).map((u) => {
                const isOwner = u.id === data?.ownerUserId;
                const name = `${u.firstName} ${u.lastName}`.trim() || u.email;
                return (
                  <div key={u.id} className="flex items-center gap-3 py-3">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#F3F4F6] text-[#6B7A8D] text-[12px] font-medium">
                      {u.firstName[0]}{u.lastName[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-[#111827] truncate">{name}</p>
                      <p className="text-[12px] text-[#9AA5B4] truncate">{u.email}</p>
                    </div>
                    {u.assignedRole && (
                      <span className="text-[11px] text-[#6B7A8D] bg-[#F3F4F6] rounded-full px-2 py-0.5">
                        {u.assignedRole.name}
                      </span>
                    )}
                    {isOwner && (
                      <span className="text-[11px] font-medium bg-[#FDF0EA] text-[#E8693A] rounded-full px-2.5 py-0.5 flex items-center gap-1">
                        <Crown className="h-3 w-3" /> Owner
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Transfer dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Transfer Ownership</DialogTitle>
            <DialogDescription>
              Choose the user who will become the new Super Admin. This action is logged and can be reversed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label>Transfer to</Label>
              <Select value={selectedUserId} onValueChange={(v) => { setSelectedUserId(v ?? ""); setConfirm(""); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a user…" />
                </SelectTrigger>
                <SelectContent>
                  {eligibleUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {`${u.firstName} ${u.lastName}`.trim() || u.email}
                      {u.assignedRole ? ` — ${u.assignedRole.name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedUser && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex gap-2.5">
                <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-[12px] text-amber-800">
                  Type <strong>{confirmText}</strong> below to confirm the transfer.
                </p>
              </div>
            )}

            {selectedUser && (
              <div className="space-y-1.5">
                <Label>Confirm name</Label>
                <Input
                  placeholder={confirmText}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} className="h-9 text-[13px]">
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!canTransfer || transferring}
                onClick={handleTransfer}
                className="h-9 text-[13px] bg-[#E8693A] hover:bg-[#C2552F] text-white"
              >
                {transferring ? "Transferring…" : "Transfer Ownership"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
