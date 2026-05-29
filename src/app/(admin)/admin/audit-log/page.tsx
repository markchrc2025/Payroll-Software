"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface AuditEntry {
  id: string;
  tenantId: string | null;
  actorUserId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  changes: unknown;
  ipAddress: string | null;
  createdAt: string;
}

interface Tenant {
  id: string;
  name: string;
}

const AUDIT_ACTIONS = [
  "CREATE", "UPDATE", "DELETE", "READ", "APPROVE",
  "REJECT", "EXPORT", "LOGIN", "LOGOUT", "IMPERSONATE",
];

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-green-100 text-green-800",
  UPDATE: "bg-blue-100 text-blue-800",
  DELETE: "bg-red-100 text-red-800",
  READ: "bg-gray-100 text-gray-700",
  APPROVE: "bg-emerald-100 text-emerald-800",
  REJECT: "bg-orange-100 text-orange-800",
  EXPORT: "bg-purple-100 text-purple-800",
  LOGIN: "bg-sky-100 text-sky-800",
  LOGOUT: "bg-slate-100 text-slate-700",
  IMPERSONATE: "bg-rose-100 text-rose-800",
};

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Filters
  const [tenantId, setTenantId] = useState("");
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [entityId, setEntityId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const entityDebounce = useRef<NodeJS.Timeout | null>(null);

  // Fetch tenant list for filter dropdown
  useEffect(() => {
    fetch("/api/admin/tenants?limit=100")
      .then((r) => r.json())
      .then((d) => setTenants(d.data ?? []))
      .catch(() => {});
  }, []);

  const fetchEntries = useCallback(
    async (p: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(p), limit: "50" });
        if (tenantId) params.set("tenantId", tenantId);
        if (action) params.set("action", action);
        if (entity) params.set("entity", entity);
        if (entityId) params.set("entityId", entityId);
        if (from) params.set("from", new Date(from).toISOString());
        if (to) params.set("to", new Date(to).toISOString());

        const res = await fetch(`/api/admin/audit-log?${params}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        setEntries(data.data ?? []);
        setTotalPages(data.totalPages ?? 1);
      } catch {
        toast.error("Failed to load audit log");
      } finally {
        setLoading(false);
      }
    },
    [tenantId, action, entity, entityId, from, to],
  );

  useEffect(() => {
    setPage(1);
    fetchEntries(1);
  }, [tenantId, action, from, to, fetchEntries]);

  useEffect(() => {
    fetchEntries(page);
  }, [page, fetchEntries]);

  function handleEntityChange(value: string) {
    setEntity(value);
    if (entityDebounce.current) clearTimeout(entityDebounce.current);
    entityDebounce.current = setTimeout(() => {
      setPage(1);
      fetchEntries(1);
    }, 300);
  }

  const tenantName = (id: string | null) => {
    if (!id) return "—";
    return tenants.find((t) => t.id === id)?.name ?? id.slice(0, 12) + "…";
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Audit Log</h1>
      <p className="text-sm text-gray-500 mb-6">Read-only activity log across all tenants.</p>

      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <div className="space-y-1">
          <Label className="text-xs">Tenant</Label>
          <Select value={tenantId || "all"} onValueChange={(v) => { const val = v ?? "all"; setTenantId(val === "all" ? "" : val); }}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All tenants" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tenants</SelectItem>
              {tenants.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Action</Label>
          <Select value={action || "all"} onValueChange={(v) => { const val = v ?? "all"; setAction(val === "all" ? "" : val); }}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All actions" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {AUDIT_ACTIONS.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Entity</Label>
          <Input
            className="h-8 text-xs"
            placeholder="e.g. Employee"
            value={entity}
            onChange={(e) => handleEntityChange(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Entity ID</Label>
          <Input
            className="h-8 text-xs"
            placeholder="cuid…"
            value={entityId}
            onChange={(e) => { setEntityId(e.target.value); setPage(1); }}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input
            type="date"
            className="h-8 text-xs"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            className="h-8 text-xs"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Timestamp</TableHead>
              <TableHead>Tenant</TableHead>
              <TableHead>Actor User ID</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Entity ID</TableHead>
              <TableHead>IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-gray-400 py-10">
                  No audit entries found.
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => (
                <>
                  <TableRow
                    key={entry.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedRow(expandedRow === entry.id ? null : entry.id)}
                  >
                    <TableCell className="text-gray-400">
                      {expandedRow === entry.id
                        ? <ChevronDown className="w-4 h-4" />
                        : <ChevronRight className="w-4 h-4" />}
                    </TableCell>
                    <TableCell className="text-xs text-gray-500 whitespace-nowrap">
                      {new Date(entry.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm max-w-[120px] truncate">
                      {tenantName(entry.tenantId)}
                    </TableCell>
                    <TableCell className="font-mono text-xs truncate max-w-[100px]">
                      {entry.actorUserId ?? "—"}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ACTION_COLORS[entry.action] ?? "bg-gray-100 text-gray-700"}`}>
                        {entry.action}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{entry.entity}</TableCell>
                    <TableCell className="font-mono text-xs truncate max-w-[100px]">
                      {entry.entityId ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">{entry.ipAddress ?? "—"}</TableCell>
                  </TableRow>
                  {expandedRow === entry.id && (
                    <TableRow key={`${entry.id}-expanded`}>
                      <TableCell colSpan={8} className="bg-gray-50 p-3">
                        <p className="text-xs font-semibold text-gray-500 mb-1">Changes (JSON diff)</p>
                        <pre className="text-xs font-mono bg-white border rounded p-2 overflow-x-auto max-h-48">
                          {entry.changes
                            ? JSON.stringify(entry.changes, null, 2)
                            : "No changes recorded."}
                        </pre>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex gap-2 justify-center mt-4">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-gray-500 self-center">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-3 text-right">
        Click any row to expand the JSON diff.
      </p>
    </div>
  );
}
