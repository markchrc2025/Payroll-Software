"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { getInitials, avatarTone } from "@/lib/avatar";

export type ComboEmployee = {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  jobTitle?: string | null;
  department?: { name: string } | null;
};

type Props = {
  employees: ComboEmployee[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
};

function fullName(e: ComboEmployee) {
  return `${e.firstName} ${e.lastName}`.trim();
}

function subtitle(e: ComboEmployee) {
  return [e.jobTitle, e.department?.name].filter(Boolean).join(" · ");
}

function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <span
      className="flex flex-none items-center justify-center rounded-full font-heading font-semibold text-white"
      style={{ height: size, width: size, background: avatarTone(name), fontSize: size * 0.42 }}
    >
      {getInitials(name)}
    </span>
  );
}

/**
 * Avatar typeahead employee picker. Filters the already-loaded employee list
 * client-side. Designed to live inside a Dialog (relative-positioned popover).
 */
export function EmployeeCombo({ employees, value, onChange, placeholder = "Select employee…" }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selected = employees.find((e) => e.id === value) ?? null;

  const filtered = employees.filter((e) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      fullName(e).toLowerCase().includes(q) ||
      e.employeeNumber.toLowerCase().includes(q) ||
      subtitle(e).toLowerCase().includes(q)
    );
  });

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(ev: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(ev.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  // Intercept Escape (capture) so it closes the popover, not the parent Dialog.
  useEffect(() => {
    if (!open) return;
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") {
        ev.stopImmediatePropagation();
        ev.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  function select(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-8 w-full items-center gap-2 rounded-md border border-input bg-transparent px-2.5 text-left text-sm shadow-xs outline-none transition-colors",
          open ? "border-ring ring-[3px] ring-ring/50" : "hover:border-ring/60",
        )}
      >
        {selected ? (
          <>
            <Avatar name={fullName(selected)} size={20} />
            <span className="min-w-0 flex-1 truncate font-medium">{fullName(selected)}</span>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{placeholder}</span>
        )}
        <ChevronDown className="size-3.5 flex-none text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute top-[calc(100%+6px)] left-0 right-0 z-50 rounded-lg border bg-popover p-1.5 shadow-lg">
          <div className="relative mb-1.5">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search employees…"
              className="h-8 pl-8"
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">No employees found.</p>
            ) : (
              filtered.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => select(e.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent",
                    e.id === value && "bg-accent",
                  )}
                >
                  <Avatar name={fullName(e)} size={26} />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-sm font-medium">{fullName(e)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {subtitle(e) || e.employeeNumber}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
