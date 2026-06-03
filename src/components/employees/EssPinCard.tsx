"use client";

import { useState } from "react";
import { KeyRound, Eye, EyeOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface EssPinCardProps {
  employeeId: string;
  hasPin: boolean;
}

export function EssPinCard({ employeeId, hasPin: initialHasPin }: EssPinCardProps) {
  const [hasPin, setHasPin] = useState(initialHasPin);
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSet(e: React.FormEvent) {
    e.preventDefault();
    if (pin.length < 4 || pin.length > 8 || !/^\d+$/.test(pin)) {
      toast.error("PIN must be 4–8 digits.");
      return;
    }
    if (pin !== confirm) {
      toast.error("PINs do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/employees/${employeeId}/ess-pin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.message ?? "Failed to set ESS PIN.");
        return;
      }
      toast.success("ESS PIN set successfully.");
      setHasPin(true);
      setPin("");
      setConfirm("");
    } finally {
      setLoading(false);
    }
  }

  async function handleClear() {
    if (!window.confirm(`Are you sure you want to clear this employee's ESS PIN? They will only be able to log in with their date of birth.`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/employees/${employeeId}/ess-pin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: null }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.message ?? "Failed to clear ESS PIN.");
        return;
      }
      toast.success("ESS PIN cleared.");
      setHasPin(false);
      setPin("");
      setConfirm("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">ESS PIN</CardTitle>
        </div>
        <CardDescription>
          {hasPin
            ? "This employee has an ESS PIN set. You can reset or clear it below."
            : "No ESS PIN is set. The employee logs in using their date of birth. Set a PIN to enable PIN-based login."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSet} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="ess-pin-new">
                {hasPin ? "New PIN" : "Set PIN"}
              </Label>
              <div className="relative">
                <Input
                  id="ess-pin-new"
                  type={showPin ? "text" : "password"}
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="4–8 digits"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  className="pr-9"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPin((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ess-pin-confirm">Confirm PIN</Label>
              <Input
                id="ess-pin-confirm"
                type={showPin ? "text" : "password"}
                inputMode="numeric"
                maxLength={8}
                placeholder="Re-enter PIN"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={loading || !pin || !confirm}>
              {hasPin ? "Reset PIN" : "Set PIN"}
            </Button>
            {hasPin && (
              <Button
                type="button"
                variant="outline"
                className="text-destructive hover:text-destructive"
                disabled={loading}
                onClick={handleClear}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Clear PIN
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
