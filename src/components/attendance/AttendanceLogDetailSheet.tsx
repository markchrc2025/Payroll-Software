"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  MapPin,
  Clock,
  Smartphone,
  Monitor,
  Globe,
  AlertTriangle,
  CheckCircle2,
  User,
  Building2,
  Camera,
  ExternalLink,
  LogIn,
  LogOut,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// Leaflet must be loaded client-side only (no SSR)
const PunchMap = dynamic(() => import("./PunchMap"), { ssr: false });
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DayPunch = {
  id: string;
  punchType: "IN" | "OUT";
  source: "KIOSK" | "ESS" | "IMPORT" | "MANUAL";
  punchedAt: string;
  outsideGeofence: boolean;
  distanceMeters: number | null;
  latitude: number | null;
  longitude: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  hasSelfie: boolean;
  kiosk?: { id: string; name: string } | null;
};

type DtrRecord = {
  id: string;
  date: string;
  dayStatus: string;
  workedMinutes: number;
  lateMinutes: number;
  undertimeMinutes: number;
  otMinutes: number;
  officialTimeIn: string | null;
  officialTimeOut: string | null;
  effectiveTimeIn: string | null;
  effectiveTimeOut: string | null;
  approvalStatus: string;
  isLocked: boolean;
  notes: string | null;
};

type AttendanceLogDetail = {
  id: string;
  employeeId: string;
  punchType: "IN" | "OUT";
  source: "KIOSK" | "ESS" | "IMPORT" | "MANUAL";
  punchedAt: string;
  outsideGeofence: boolean;
  distanceMeters: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  latitude: number | null;
  longitude: number | null;
  hasSelfie: boolean;
  createdAt: string;
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
    employeeNumber: string;
    department?: { name: string } | null;
    branch?: { name: string } | null;
  };
  kiosk?: { id: string; name: string } | null;
  dayPunches: DayPunch[];
  dtr: DtrRecord | null;
};

interface AttendanceLogDetailSheetProps {
  logId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Manila",
  });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-PH", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
}

function minsToHHmm(mins: number): string {
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function parseUserAgent(ua: string | null) {
  if (!ua) return null;
  const mobile = /mobile|android|iphone|ipad/i.test(ua);
  const browser = ua.match(/(Chrome|Firefox|Safari|Edge|Opera)\/[\d.]+/i)?.[0] ?? null;
  return { mobile, browser };
}

const SOURCE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  KIOSK: "default",
  ESS: "secondary",
  IMPORT: "outline",
  MANUAL: "outline",
};

const DAY_STATUS_LABELS: Record<string, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  HALF_DAY: "Half Day",
  REST_DAY: "Rest Day",
  HOLIDAY: "Holiday",
  LEAVE: "On Leave",
  SUSPENDED: "Suspended",
};

// ---------------------------------------------------------------------------
// Sub-component: single punch row in TIME CLOCK tab
// ---------------------------------------------------------------------------

function PunchRow({ punch }: { punch: DayPunch }) {
  const [expanded, setExpanded] = useState(false);
  const [selfieError, setSelfieError] = useState(false);
  const ua = parseUserAgent(punch.userAgent);
  const mapsUrl =
    punch.latitude != null && punch.longitude != null
      ? `https://www.openstreetmap.org/?mlat=${punch.latitude}&mlon=${punch.longitude}#map=16/${punch.latitude}/${punch.longitude}`
      : null;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header row */}
      <button
        type="button"
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/40 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Big time */}
        <div className="w-20 shrink-0">
          <p className={`text-lg font-bold ${punch.punchType === "IN" ? "text-emerald-600" : "text-slate-500"}`}>
            {fmtTime(punch.punchedAt)}
          </p>
        </div>

        {/* Icons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {punch.punchType === "IN" ? (
            <LogIn className="h-4 w-4 text-emerald-500" />
          ) : (
            <LogOut className="h-4 w-4 text-slate-400" />
          )}
          {punch.hasSelfie && <Camera className="h-3.5 w-3.5 text-blue-500" />}
          {punch.latitude != null && <MapPin className="h-3.5 w-3.5 text-amber-500" />}
        </div>

        {/* Source badge + geofence */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={SOURCE_VARIANT[punch.source] ?? "outline"} className="text-xs">
              {punch.source}
            </Badge>
            {punch.kiosk && (
              <span className="text-xs text-muted-foreground">{punch.kiosk.name}</span>
            )}
            {punch.outsideGeofence && (
              <span className="flex items-center gap-1 text-amber-600 text-xs font-medium">
                <AlertTriangle className="h-3 w-3" />
                Outside
                {punch.distanceMeters != null && (
                  <span className="font-normal text-muted-foreground">({punch.distanceMeters}m)</span>
                )}
              </span>
            )}
          </div>
          {punch.ipAddress && (
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">{punch.ipAddress}</p>
          )}
        </div>

        {/* Expand chevron */}
        <div className="shrink-0 text-muted-foreground">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t px-3 pb-3 pt-2 space-y-3 bg-muted/20">
          {/* Selfie + Map side-by-side when both available, stacked otherwise */}
          <div className={`grid gap-2 ${
            punch.hasSelfie && punch.latitude != null ? "grid-cols-2" : "grid-cols-1"
          }`}>
            {punch.hasSelfie && (
              <div className="overflow-hidden rounded-lg border bg-muted/40">
                {selfieError ? (
                  <div className="flex h-[220px] items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Camera className="h-4 w-4" />
                    Selfie unavailable
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/attendance-logs/${punch.id}/selfie`}
                    alt="Punch selfie"
                    className="w-full object-cover h-[220px]"
                    onError={() => setSelfieError(true)}
                  />
                )}
              </div>
            )}

            {punch.latitude != null && punch.longitude != null && (
              <div className="rounded-lg overflow-hidden border">
                <PunchMap
                  latitude={punch.latitude}
                  longitude={punch.longitude}
                  outsideGeofence={punch.outsideGeofence}
                  distanceMeters={punch.distanceMeters}
                  employeeName="Employee"
                  punchType={punch.punchType}
                  punchedAt={punch.punchedAt}
                />
              </div>
            )}
          </div>

          {/* Coordinates + open link */}
          {punch.latitude != null && punch.longitude != null && (
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono text-muted-foreground">
                {punch.latitude.toFixed(6)}, {punch.longitude.toFixed(6)}
              </span>
              {mapsUrl && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                >
                  Open in OpenStreetMap
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}

          {/* Geofence status */}
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {punch.outsideGeofence ? (
              <span className="text-amber-600 font-medium flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Outside Geofence
                {punch.distanceMeters != null && (
                  <span className="text-muted-foreground font-normal">
                    &nbsp;({punch.distanceMeters.toLocaleString()}m from boundary)
                  </span>
                )}
              </span>
            ) : (
              <span className="text-emerald-600 font-medium flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Inside Geofence
              </span>
            )}
          </div>

          {/* Device */}
          {ua && (
            <div className="flex items-center gap-2 text-sm">
              {ua.mobile ? (
                <Smartphone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              ) : (
                <Monitor className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
              <span>{ua.mobile ? "Mobile" : "Desktop / Laptop"}</span>
              {ua.browser && (
                <span className="text-xs text-muted-foreground">{ua.browser}</span>
              )}
            </div>
          )}

          {/* Record ID */}
          <p className="text-xs text-muted-foreground font-mono break-all">{punch.id}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AttendanceLogDetailSheet({
  logId,
  open,
  onOpenChange,
}: AttendanceLogDetailSheetProps) {
  const [log, setLog] = useState<AttendanceLogDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!open || !logId) {
      setLog(null);
      return;
    }
    setIsLoading(true);
    setLog(null);
    fetch(`/api/attendance-logs/${logId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.data) setLog(json.data);
      })
      .catch(() => setLog(null))
      .finally(() => setIsLoading(false));
  }, [logId, open]);

  const employeeName = log?.employee
    ? `${log.employee.firstName} ${log.employee.lastName}`
    : log?.employeeId ?? "—";

  const employeeNumber = log?.employee?.employeeNumber ?? "";

  // Determine first in / last out from dayPunches
  const insLogs = log?.dayPunches.filter((p) => p.punchType === "IN") ?? [];
  const outsLogs = log?.dayPunches.filter((p) => p.punchType === "OUT") ?? [];
  const firstIn = insLogs.length > 0 ? insLogs[0] : null;
  const lastOut = outsLogs.length > 0 ? outsLogs[outsLogs.length - 1] : null;

  const dtr = log?.dtr ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            {isLoading ? (
              <Skeleton className="h-5 w-48" />
            ) : log ? (
              <>
                {log.punchType === "IN" ? (
                  <LogIn className="h-4 w-4 text-emerald-600 shrink-0" />
                ) : (
                  <LogOut className="h-4 w-4 text-slate-500 shrink-0" />
                )}
                Attendance Transaction
              </>
            ) : (
              "Attendance Detail"
            )}
          </DialogTitle>
          <DialogDescription asChild className="text-xs">
            <span>
              {isLoading ? (
                <Skeleton className="h-3 w-56" />
              ) : log ? (
                <>
                  <span className="font-medium">{employeeName}</span>
                  {employeeNumber && (
                    <span className="text-muted-foreground"> ({employeeNumber})</span>
                  )}
                </>
              ) : null}
            </span>
          </DialogDescription>
        </DialogHeader>

        {/* Loading skeleton */}
        {isLoading && (
          <div className="p-5 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        )}

        {/* Error state */}
        {!isLoading && !log && (
          <p className="p-10 text-center text-sm text-muted-foreground">
            Could not load attendance details.
          </p>
        )}

        {/* Two-tab content */}
        {!isLoading && log && (
          <Tabs defaultValue="attendance" className="flex-1 flex flex-col overflow-hidden">
            {/* Tab bar — styled like reference with bottom-border underline */}
            <TabsList className="grid grid-cols-2 h-10 rounded-none bg-muted/50 border-b shrink-0 p-0">
              <TabsTrigger
                value="attendance"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none h-full text-xs font-semibold uppercase tracking-wide"
              >
                Attendance
              </TabsTrigger>
              <TabsTrigger
                value="timeclock"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none h-full text-xs font-semibold uppercase tracking-wide"
              >
                Time Clock
              </TabsTrigger>
            </TabsList>

            {/* ── ATTENDANCE TAB ── */}
            <TabsContent value="attendance" className="flex-1 overflow-y-auto px-5 py-4 mt-0">
              <div className="space-y-0">
                <InfoRow label="Employee">
                  <span className="font-medium">{employeeName}</span>
                  {employeeNumber && (
                    <span className="text-muted-foreground ml-1">({employeeNumber})</span>
                  )}
                </InfoRow>

                {log.employee?.department && (
                  <InfoRow label="Department">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      {log.employee.department.name}
                    </span>
                  </InfoRow>
                )}

                {log.employee?.branch && (
                  <InfoRow label="Branch">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      {log.employee.branch.name}
                    </span>
                  </InfoRow>
                )}

                <InfoRow label="Date">
                  {fmtDate(log.punchedAt)}
                </InfoRow>

                <InfoRow label="Status">
                  {dtr ? (
                    <Badge variant="outline" className="text-xs">
                      {DAY_STATUS_LABELS[dtr.dayStatus] ?? dtr.dayStatus}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">No DTR record</span>
                  )}
                </InfoRow>

                <Separator className="my-2" />

                <InfoRow label="First Clock-In">
                  {dtr?.effectiveTimeIn ? (
                    <span className="font-semibold text-emerald-600 flex items-center gap-1.5">
                      <LogIn className="h-3.5 w-3.5" />
                      {fmtTime(dtr.effectiveTimeIn)}
                    </span>
                  ) : firstIn ? (
                    <span className="font-semibold text-emerald-600 flex items-center gap-1.5">
                      <LogIn className="h-3.5 w-3.5" />
                      {fmtTime(firstIn.punchedAt)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </InfoRow>

                <InfoRow label="Last Clock-Out">
                  {dtr?.effectiveTimeOut ? (
                    <span className="font-semibold text-slate-600 flex items-center gap-1.5">
                      <LogOut className="h-3.5 w-3.5" />
                      {fmtTime(dtr.effectiveTimeOut)}
                    </span>
                  ) : lastOut ? (
                    <span className="font-semibold text-slate-600 flex items-center gap-1.5">
                      <LogOut className="h-3.5 w-3.5" />
                      {fmtTime(lastOut.punchedAt)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </InfoRow>

                <Separator className="my-2" />

                <InfoRow label="Duration (Hour)">
                  {dtr ? (
                    <span className="font-mono">{minsToHHmm(dtr.workedMinutes)}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </InfoRow>

                <InfoRow label="Late (Hour)">
                  {dtr && dtr.lateMinutes > 0 ? (
                    <span className="font-mono text-red-500">{minsToHHmm(dtr.lateMinutes)}</span>
                  ) : (
                    <span className="text-muted-foreground font-mono">00:00</span>
                  )}
                </InfoRow>

                <InfoRow label="Overtime / Undertime (Hour)">
                  {dtr ? (
                    dtr.otMinutes > 0 ? (
                      <span className="font-mono text-blue-600">+{minsToHHmm(dtr.otMinutes)}</span>
                    ) : dtr.undertimeMinutes > 0 ? (
                      <span className="font-mono text-amber-600">-{minsToHHmm(dtr.undertimeMinutes)}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </InfoRow>

                {dtr && (
                  <InfoRow label="Approval">
                    <Badge
                      variant={
                        dtr.approvalStatus === "APPROVED"
                          ? "default"
                          : dtr.approvalStatus === "REJECTED"
                          ? "destructive"
                          : "secondary"
                      }
                      className="text-xs"
                    >
                      {dtr.approvalStatus}
                    </Badge>
                    {dtr.isLocked && (
                      <span className="ml-2 text-xs text-muted-foreground">(Locked)</span>
                    )}
                  </InfoRow>
                )}

                {dtr?.notes && (
                  <>
                    <Separator className="my-2" />
                    <InfoRow label="Remark">
                      <span className="text-sm">{dtr.notes}</span>
                    </InfoRow>
                  </>
                )}

                {/* Selected punch detail */}
                <Separator className="my-2" />
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Selected Punch
                </p>
                <InfoRow label="Punch Type">
                  <Badge variant={log.punchType === "IN" ? "default" : "secondary"} className="text-xs">
                    Clock {log.punchType === "IN" ? "In" : "Out"}
                  </Badge>
                </InfoRow>
                <InfoRow label="Timestamp">
                  <span className="font-medium text-xs">{fmtDateTime(log.punchedAt)}</span>
                </InfoRow>
                <InfoRow label="Source">
                  <Badge variant={SOURCE_VARIANT[log.source] ?? "outline"} className="text-xs">
                    {log.source}
                  </Badge>
                  {log.kiosk && (
                    <span className="ml-2 text-xs text-muted-foreground">{log.kiosk.name}</span>
                  )}
                </InfoRow>
                <InfoRow label="Geofence">
                  {log.outsideGeofence ? (
                    <span className="flex items-center gap-1 text-amber-600 text-xs font-medium">
                      <AlertTriangle className="h-3 w-3" />
                      Outside
                      {log.distanceMeters != null && (
                        <span className="text-muted-foreground font-normal">
                          &nbsp;({log.distanceMeters.toLocaleString()}m)
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium">
                      <CheckCircle2 className="h-3 w-3" />
                      Inside
                    </span>
                  )}
                </InfoRow>
              </div>
            </TabsContent>

            {/* ── TIME CLOCK TAB ── */}
            <TabsContent value="timeclock" className="flex-1 overflow-y-auto px-5 py-4 mt-0">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold">
                  Total:{" "}
                  <span className="text-primary">{log.dayPunches.length}</span>
                </p>
                <div className="flex gap-2">
                  {insLogs.length > 0 && (
                    <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                      <LogIn className="h-3.5 w-3.5" />
                      {insLogs.length} In
                    </span>
                  )}
                  {outsLogs.length > 0 && (
                    <span className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                      <LogOut className="h-3.5 w-3.5" />
                      {outsLogs.length} Out
                    </span>
                  )}
                </div>
              </div>

              {log.dayPunches.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">
                  No punches found for this day.
                </p>
              ) : (
                <div className="space-y-2">
                  {log.dayPunches.map((punch) => (
                    <PunchRow key={punch.id} punch={punch} />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: labeled info row for ATTENDANCE tab
// ---------------------------------------------------------------------------

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b last:border-0">
      <span className="text-xs text-muted-foreground shrink-0 w-44">{label}</span>
      <span className="text-sm text-right flex-1">{children}</span>
    </div>
  );
}

