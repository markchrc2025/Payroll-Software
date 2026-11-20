"use client";

/**
 * PAY-201: picker for a BIR RDO Code, from BIR's own list (eBIRForms rdo.xml).
 */
import { RDO_CODES } from "@/lib/bir/rdo-codes";

export function RdoCodeSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
}) {
  return (
    <select
      id={id}
      data-testid="rdo-code-select"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-[var(--line)] bg-transparent px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--acc)] disabled:opacity-50"
    >
      <option value="">Not set</option>
      {RDO_CODES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}
