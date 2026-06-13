"use client";

import { useState, useEffect, useRef } from "react";
import { Search } from "lucide-react";
import Link from "next/link";

type Hit = {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  department: { id: string; name: string } | null;
};

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ⌘K / Ctrl+K focuses the search input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Debounced fetch
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    const id = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/employees?search=${encodeURIComponent(query.trim())}&limit=8`
        );
        if (res.ok) {
          const json = await res.json();
          const hits: Hit[] = Array.isArray(json) ? json : (json.data ?? []);
          setResults(hits);
          setOpen(true);
        }
      } catch {
        // ignore transient errors
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [query]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleSelect() {
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <div className="relative flex items-center">
        <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search employees…"
          aria-label="Global search"
          className="w-full rounded-md border border-input bg-background/70 pl-9 pr-16 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:bg-background transition-colors"
        />
        <kbd className="pointer-events-none absolute right-2.5 hidden sm:flex select-none items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          <span className="text-[10px]">⌘</span>K
        </kbd>
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-popover border border-border rounded-lg shadow-xl overflow-hidden z-50">
          {results.length > 0 ? (
            <>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">
                Employees
              </div>
              {results.map((hit) => (
                <Link
                  key={hit.id}
                  href={`/employees/${encodeURIComponent(hit.employeeNumber)}`}
                  onClick={handleSelect}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-accent transition-colors"
                >
                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-[11px] font-semibold text-primary shrink-0">
                    {hit.firstName[0]}
                    {hit.lastName[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">
                      {hit.firstName} {hit.lastName}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {hit.employeeNumber}
                      {hit.department ? ` · ${hit.department.name}` : ""}
                    </div>
                  </div>
                </Link>
              ))}
            </>
          ) : !loading ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              No employees found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            <div className="px-4 py-3 text-sm text-muted-foreground">Searching…</div>
          )}
        </div>
      )}
    </div>
  );
}
