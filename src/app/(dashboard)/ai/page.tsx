"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { Send, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

// ── Types ───────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface TokenCount {
  inputTokens: number;
  outputTokens: number;
}

interface PayrollRun {
  id: string;
  periodStart: string;
  periodEnd: string;
  cycle: string;
  status: string;
}

interface PayrollSheet {
  id: string;          // This is the payslipId
  employeeId: string;
}

interface PayrollRunDetail {
  id: string;
  periodStart: string;
  periodEnd: string;
  sheets: PayrollSheet[];
}

interface RenderedPayslip {
  employee: { id: string; name: string };
}

interface UsageData {
  totalCalls: number;
  totalCostMicroUsd: string;
  byTouchpoint: Record<string, {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    costMicroUsd: string;
  }>;
  recentRows: Array<{
    id: string;
    touchpoint: string;
    inputTokens: number;
    outputTokens: number;
    costMicroUsd: string;
    createdAt: string;
  }>;
}

// ── Constants ───────────────────────────────────────────────────────────────

const CHAT_CHIPS = [
  "How do I compute 13th month pay?",
  "What is the SSS contribution table for 2026?",
  "How do I handle a maternity leave request?",
  "What is the minimum wage in NCR?",
];

const TOUCHPOINT_LABELS: Record<string, string> = {
  HR_CHAT: "HR Chat",
  PAYSLIP_QA: "Payslip Q&A",
  COMPLIANCE_HELPER: "Compliance",
  ANOMALY_FLAGGING: "Anomaly Check",
  DOC_EXTRACTION: "Doc Extraction",
  RESUME_PARSE: "Resume Parse",
};

// ── Shared Chat UI ───────────────────────────────────────────────────────────

interface ChatPanelProps {
  messages: ChatMessage[];
  sending: boolean;
  tokens: TokenCount | null;
  input: string;
  onInputChange: (v: string) => void;
  onSend: () => void;
  onChipClick?: (text: string) => void;
  chips?: string[];
  useSonnet?: boolean;
  onUseSonnetChange?: (v: boolean) => void;
  disabled?: boolean;
  disabledReason?: string;
  label?: string;
}

function ChatPanel({
  messages,
  sending,
  tokens,
  input,
  onInputChange,
  onSend,
  onChipClick,
  chips,
  useSonnet,
  onUseSonnetChange,
  disabled,
  disabledReason,
  label,
}: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }

  if (disabled && disabledReason) {
    return (
      <Card className="border-sky-200 bg-sky-50 max-w-lg">
        <CardHeader>
          <CardTitle className="text-sky-800 text-base">AI Assistant Unavailable</CardTitle>
          <CardDescription className="text-sky-700">{disabledReason}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-sky-600">
            AI Assistant is available on the <strong>PRO plan</strong>. Contact your administrator to upgrade.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col h-[60vh]">
      {label && (
        <p className="text-sm text-gray-500 mb-3 italic">{label}</p>
      )}

      {/* Chips */}
      {chips && chips.length > 0 && messages.length === 0 && (
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1 shrink-0">
          {chips.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => onChipClick?.(chip)}
              className="whitespace-nowrap rounded-full border border-sky-200 bg-sky-50 text-sky-700 text-xs px-3 py-1.5 hover:bg-sky-100 transition-colors shrink-0"
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-3 pr-1">
        {messages.length === 0 && (
          <p className="text-gray-400 text-sm text-center mt-8">
            Start a conversation by typing a message below.
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap
                ${msg.role === "user"
                  ? "bg-sky-500 text-white rounded-br-sm"
                  : "bg-gray-100 text-gray-800 rounded-bl-sm"
                }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-2.5 flex gap-1.5 items-center">
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Token count */}
      {tokens && (
        <p className="text-xs text-gray-400 mb-1">
          Prompt: {tokens.inputTokens.toLocaleString()} tokens &nbsp;|&nbsp; Response: {tokens.outputTokens.toLocaleString()} tokens
        </p>
      )}

      {/* Input row */}
      <div className="flex gap-2 shrink-0">
        <div className="flex-1 flex flex-col gap-1">
          <Textarea
            className="resize-none text-sm"
            rows={2}
            placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
          />
          {onUseSonnetChange !== undefined && (
            <div className="flex items-center gap-1.5">
              <Checkbox
                id="use-sonnet"
                checked={useSonnet ?? false}
                onCheckedChange={(c: boolean | "indeterminate") => onUseSonnetChange(c === true)}
              />
              <label htmlFor="use-sonnet" className="text-xs text-gray-500 cursor-pointer">
                Use Sonnet (better for complex queries)
              </label>
            </div>
          )}
        </div>
        <Button
          className="self-end"
          size="icon"
          onClick={onSend}
          disabled={sending || !input.trim()}
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}

// ── HR Chat Tab ──────────────────────────────────────────────────────────────

function HrChatTab() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [tokens, setTokens] = useState<TokenCount | null>(null);
  const [useSonnet, setUseSonnet] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [disabledReason, setDisabledReason] = useState("");

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setSending(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, useSonnet }),
      });
      if (res.status === 403) {
        const d = await res.json();
        setDisabled(true);
        setDisabledReason(d.error ?? "AI feature not available");
        setMessages(messages);
        return;
      }
      if (!res.ok) {
        toast.error("AI request failed. Please try again.");
        setMessages(messages);
        return;
      }
      const data = await res.json();
      setMessages([...next, { role: "assistant", content: data.text }]);
      setTokens({ inputTokens: data.inputTokens, outputTokens: data.outputTokens });
    } catch {
      toast.error("Network error. Please try again.");
      setMessages(messages);
    } finally {
      setSending(false);
    }
  }

  return (
    <ChatPanel
      messages={messages}
      sending={sending}
      tokens={tokens}
      input={input}
      onInputChange={setInput}
      onSend={send}
      chips={CHAT_CHIPS}
      onChipClick={setInput}
      useSonnet={useSonnet}
      onUseSonnetChange={setUseSonnet}
      disabled={disabled}
      disabledReason={disabledReason}
    />
  );
}

// ── Compliance Tab ───────────────────────────────────────────────────────────

function ComplianceTab() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [tokens, setTokens] = useState<TokenCount | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [disabledReason, setDisabledReason] = useState("");

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setSending(true);
    try {
      const res = await fetch("/api/ai/compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      if (res.status === 403) {
        const d = await res.json();
        setDisabled(true);
        setDisabledReason(d.error ?? "AI feature not available");
        setMessages(messages);
        return;
      }
      if (!res.ok) {
        toast.error("AI request failed. Please try again.");
        setMessages(messages);
        return;
      }
      const data = await res.json();
      setMessages([...next, { role: "assistant", content: data.text }]);
      setTokens({ inputTokens: data.inputTokens, outputTokens: data.outputTokens });
    } catch {
      toast.error("Network error. Please try again.");
      setMessages(messages);
    } finally {
      setSending(false);
    }
  }

  return (
    <ChatPanel
      messages={messages}
      sending={sending}
      tokens={tokens}
      input={input}
      onInputChange={setInput}
      onSend={send}
      disabled={disabled}
      disabledReason={disabledReason}
      label="Ask questions about Philippine labor law, BIR compliance, and DOLE regulations."
    />
  );
}

// ── Payslip Q&A Tab ──────────────────────────────────────────────────────────

interface PayslipOption {
  sheetId: string;
  employeeId: string;
  employeeName: string;
}

function PayslipQaTab() {
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);

  const [selectedRunId, setSelectedRunId] = useState("");
  const [payslipOptions, setPayslipOptions] = useState<PayslipOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);

  const [selectedSheetId, setSelectedSheetId] = useState("");
  const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null);
  const [selectedEmployeeName, setSelectedEmployeeName] = useState("");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [tokens, setTokens] = useState<TokenCount | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [disabledReason, setDisabledReason] = useState("");

  useEffect(() => {
    fetch("/api/payroll/runs?status=FINALIZED&limit=50")
      .then((r) => r.json())
      .then((d) => setRuns(d.data ?? []))
      .catch(() => toast.error("Failed to load payroll runs"))
      .finally(() => setRunsLoading(false));
  }, []);

  async function handleRunSelect(runId: string) {
    setSelectedRunId(runId);
    setSelectedSheetId("");
    setPayslipOptions([]);
    setMessages([]);
    setTokens(null);
    setSelectedRun(runs.find((r) => r.id === runId) ?? null);

    setOptionsLoading(true);
    try {
      const [detailRes, payslipsRes] = await Promise.all([
        fetch(`/api/payroll/runs/${runId}`),
        fetch(`/api/payroll/runs/${runId}/payslips`),
      ]);
      if (!detailRes.ok || !payslipsRes.ok) {
        toast.error("Failed to load run details");
        return;
      }
      const detail: PayrollRunDetail = await detailRes.json();
      const payslipsData: { data: RenderedPayslip[] } = await payslipsRes.json();

      // Build a map: employeeId → rendered employee name
      const nameMap = new Map(payslipsData.data.map((p) => [p.employee.id, p.employee.name]));

      const options: PayslipOption[] = detail.sheets.map((s) => ({
        sheetId: s.id,
        employeeId: s.employeeId,
        employeeName: nameMap.get(s.employeeId) ?? s.employeeId,
      }));
      setPayslipOptions(options);
    } catch {
      toast.error("Failed to load payslips");
    } finally {
      setOptionsLoading(false);
    }
  }

  function handleEmployeeSelect(sheetId: string) {
    setSelectedSheetId(sheetId);
    setMessages([]);
    setTokens(null);
    const opt = payslipOptions.find((o) => o.sheetId === sheetId);
    setSelectedEmployeeName(opt?.employeeName ?? "");
  }

  async function send() {
    const text = input.trim();
    if (!text || sending || !selectedSheetId) return;
    setInput("");
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setSending(true);
    try {
      const res = await fetch("/api/ai/payslip-qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payslipId: selectedSheetId, messages: next }),
      });
      if (res.status === 403) {
        const d = await res.json();
        setDisabled(true);
        setDisabledReason(d.error ?? "AI feature not available");
        setMessages(messages);
        return;
      }
      if (!res.ok) {
        toast.error("AI request failed. Please try again.");
        setMessages(messages);
        return;
      }
      const data = await res.json();
      setMessages([...next, { role: "assistant", content: data.text }]);
      setTokens({ inputTokens: data.inputTokens, outputTokens: data.outputTokens });
    } catch {
      toast.error("Network error. Please try again.");
      setMessages(messages);
    } finally {
      setSending(false);
    }
  }

  if (disabled && disabledReason) {
    return (
      <Card className="border-sky-200 bg-sky-50 max-w-lg">
        <CardHeader>
          <CardTitle className="text-sky-800 text-base">AI Assistant Unavailable</CardTitle>
          <CardDescription className="text-sky-700">{disabledReason}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-sky-600">
            AI Assistant is available on the <strong>PRO plan</strong>. Contact your administrator to upgrade.
          </p>
        </CardContent>
      </Card>
    );
  }

  const canChat = !!selectedSheetId;

  return (
    <div className="space-y-4">
      {/* Step 1: Select payroll run */}
      <div className="flex gap-4 items-end">
        <div className="space-y-1 min-w-[260px]">
          <Label>Payroll Run</Label>
          {runsLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <Select value={selectedRunId || "none"} onValueChange={(v) => { const val = v ?? "none"; if (val !== "none") handleRunSelect(val); }}>
              <SelectTrigger>
                <SelectValue placeholder="Select a finalized run…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" disabled>Select a run…</SelectItem>
                {runs.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {new Date(r.periodStart).toLocaleDateString()} – {new Date(r.periodEnd).toLocaleDateString()} ({r.cycle})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Step 2: Select employee */}
        {selectedRunId && (
          <div className="space-y-1 min-w-[220px]">
            <Label>Employee</Label>
            {optionsLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <Select value={selectedSheetId || "none"} onValueChange={(v) => { const val = v ?? "none"; if (val !== "none") handleEmployeeSelect(val); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" disabled>Select employee…</SelectItem>
                  {payslipOptions.map((o) => (
                    <SelectItem key={o.sheetId} value={o.sheetId}>
                      {o.employeeName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </div>

      {/* Context label */}
      {canChat && selectedRun && (
        <p className="text-sm text-sky-700 bg-sky-50 border border-sky-200 rounded px-3 py-2">
          Analyzing payslip for <strong>{selectedEmployeeName}</strong>, period{" "}
          <strong>{new Date(selectedRun.periodStart).toLocaleDateString()}</strong> –{" "}
          <strong>{new Date(selectedRun.periodEnd).toLocaleDateString()}</strong>
        </p>
      )}

      {/* Chat — only shown when an employee is selected */}
      {canChat ? (
        <ChatPanel
          messages={messages}
          sending={sending}
          tokens={tokens}
          input={input}
          onInputChange={setInput}
          onSend={send}
        />
      ) : (
        <p className="text-sm text-gray-400 italic">
          Select a payroll run and employee above to start the Q&amp;A.
        </p>
      )}
    </div>
  );
}

// ── Usage Tab ────────────────────────────────────────────────────────────────

function UsageTab() {
  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [from, setFrom] = useState(thirtyDaysAgo.toISOString().slice(0, 10));
  const [to, setTo] = useState(today.toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<UsageData | null>(null);

  const fetchUsage = useCallback(async (f: string, t: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from: f, to: t });
      const res = await fetch(`/api/ai/usage?${params}`);
      if (!res.ok) {
        toast.error("Failed to load usage data");
        return;
      }
      const d = await res.json();
      setData(d);
    } catch {
      toast.error("Failed to load usage data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsage(from, to);
  }, [fetchUsage, from, to]);

  const totalInputTokens = data
    ? Object.values(data.byTouchpoint).reduce((s, v) => s + v.inputTokens, 0)
    : 0;
  const totalOutputTokens = data
    ? Object.values(data.byTouchpoint).reduce((s, v) => s + v.outputTokens, 0)
    : 0;
  const estCostCents = data
    ? Number(BigInt(data.totalCostMicroUsd)) / 10000   // microUSD → USD cents-equivalent in PHP (rough)
    : 0;

  const touchpoints = data ? Object.entries(data.byTouchpoint) : [];
  const totalCalls = data?.totalCalls ?? 0;

  return (
    <div className="space-y-5">
      {/* Date range */}
      <div className="flex gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input type="date" className="h-8" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input type="date" className="h-8" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchUsage(from, to)} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard label="Total Calls" value={totalCalls.toLocaleString()} />
          <SummaryCard label="Input Tokens" value={totalInputTokens.toLocaleString()} />
          <SummaryCard label="Output Tokens" value={totalOutputTokens.toLocaleString()} />
          <SummaryCard
            label="Est. Cost"
            value={`$${(Number(BigInt(data?.totalCostMicroUsd ?? "0")) / 1_000_000).toFixed(4)}`}
          />
        </div>
      )}

      <Separator />

      {/* Touchpoint breakdown */}
      <h3 className="text-sm font-semibold text-gray-700">Breakdown by Touchpoint</h3>
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
      ) : touchpoints.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No usage data for this period.</p>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Touchpoint</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Input Tokens</TableHead>
                <TableHead className="text-right">Output Tokens</TableHead>
                <TableHead>% of Calls</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {touchpoints.map(([tp, stats]) => {
                const pct = totalCalls > 0 ? Math.round((stats.calls / totalCalls) * 100) : 0;
                return (
                  <TableRow key={tp}>
                    <TableCell>
                      <Badge variant="secondary">{TOUCHPOINT_LABELS[tp] ?? tp}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{stats.calls.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{stats.inputTokens.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{stats.outputTokens.toLocaleString()}</TableCell>
                    <TableCell className="w-36">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-100 rounded overflow-hidden">
                          <div
                            className="bg-sky-500 h-2 rounded"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-8 text-right">{pct}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-gray-500 mb-1">{label}</p>
        <p className="text-xl font-bold text-gray-900">{value}</p>
      </CardContent>
    </Card>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AiPage() {
  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">AI Assistant</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Powered by Claude. HR Chat uses Haiku; Compliance uses Sonnet. All conversations are tenant-scoped.
        </p>
      </div>

      <Tabs defaultValue="hr-chat">
        <TabsList className="mb-6">
          <TabsTrigger value="hr-chat">HR Chat</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
          <TabsTrigger value="payslip-qa">Payslip Q&amp;A</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
        </TabsList>

        <TabsContent value="hr-chat">
          <HrChatTab />
        </TabsContent>

        <TabsContent value="compliance">
          <ComplianceTab />
        </TabsContent>

        <TabsContent value="payslip-qa">
          <PayslipQaTab />
        </TabsContent>

        <TabsContent value="usage">
          <UsageTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
