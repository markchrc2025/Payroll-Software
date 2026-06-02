"use client";

import { useEffect, useState } from "react";
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
  Fingerprint,
  Camera,
  ExternalLink,
  LogIn,
  LogOut,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
};

interface AttendanceLogDetailSheetProps {
  logId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function parseUserAgent(ua: string | null) {
  if (!ua) return null;
  // Simple detection for display purposes
  const mobile = /mobile|android|iphone|ipad/i.test(ua);
  const browser = ua.match(/(Chrome|Firefox|Safari|Edge|Opera)\/[\d.]+/i)?.[0] ?? null;
  return { mobile, browser, raw: ua };
}

const SOURCE_LABELS: Record<string, string> = {
  KIOSK: "Kiosk Terminal",
  ESS: "Employee Self-Service",
  IMPORT: "Data Import",
  MANUAL: "Manual Entry",
};

const SOURCE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  KIOSK: "default",
  ESS: "secondary",
  IMPORT: "outline",
  MANUAL: "outline",
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
        <div className="mt-0.5 text-sm text-foreground">{children}</div>
      </div>
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
  const [selfieError, setSelfieError] = useState(false);

  useEffect(() => {
    if (!open || !logId) {
      setLog(null);
      setSelfieError(false);
      return;
    }
    setIsLoading(true);
    setLog(null);
    setSelfieError(false);
    fetch(`/api/attendance-logs/${logId}`)
      .then((r) => r.json())
      .then((json) => setLog(json.data ?? null))
      .catch(() => setLog(null))
      .finally(() => setIsLoading(false));
  }, [logId, open]);

  const ua = log ? parseUserAgent(log.userAgent) : null;
  const mapsUrl =
    log?.latitude != null && log?.longitude != null
      ? `https://www.google.com/maps?q=${log.latitude},${log.longitude}`
      : null;

  const employeeName = log?.employee
    ? `${log.employee.firstName} ${log.employee.lastName}`
    : log?.employeeId ?? "—";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {isLoading ? (
              <Skeleton className="h-6 w-40" />
            ) : log ? (
              <>
                {log.punchType === "IN" ? (
                  <LogIn className="h-4 w-4 text-emerald-600" />
                ) : (
                  <LogOut className="h-4 w-4 text-slate-500" />
                )}
                Clock {log.punchType === "IN" ? "In" : "Out"} — {employeeName}
              </>
            ) : (
              "Attendance Detail"
            )}
          </SheetTitle>
          <SheetDescription>
            {isLoading ? (
              <Skeleton className="h-4 w-56" />
            ) : log ? (
              fmtDateTime(log.punchedAt)
            ) : null}
          </SheetDescription>
        </SheetHeader>

        {isLoading && (
          <div className="mt-6 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-7 w-7 rounded-md" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-full" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && !log && (
          <p className="mt-10 text-center text-sm text-muted-foreground">
            Could not load attendance details.
          </p>
        )}

        {!isLoading && log && (
          <div className="mt-4 space-y-1">
            {/* Selfie */}
            {log.hasSelfie && (
              <div className="mb-4 overflow-hidden rounded-xl border bg-muted/40">
                {selfieError ? (
                  <div className="flex h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Camera className="h-4 w-4" />
                    Selfie unavailable
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/attendance-logs/${log.id}/selfie`}
                    alt="Clock-in selfie"
                    className="w-full object-cover max-h-64"
                    onError={() => setSelfieError(true)}
                  />
                )}
              </div>
            )}

            {/* Punch type + source */}
            <DetailRow icon={log.punchType === "IN" ? LogIn : LogOut} label="Punch Type">
              <div className="flex items-center gap-2">
                <Badge
                  variant={log.punchType === "IN" ? "default" : "secondary"}
                  className="text-xs"
                >
                  Clock {log.punchType === "IN" ? "In" : "Out"}
                </Badge>
              </div>
            </DetailRow>

            <DetailRow icon={Clock} label="Timestamp">
              <span className="font-medium">{fmtDateTime(log.punchedAt)}</span>
            </DetailRow>

            <Separator />

            {/* Employee */}
            <DetailRow icon={User} label="Employee">
              <span className="font-medium">{employeeName}</span>
              {log.employee && (
                <span className="block text-xs text-muted-foreground">
                  {log.employee.employeeNumber}
                </span>
              )}
            </DetailRow>

            {log.employee?.department && (
              <DetailRow icon={Building2} label="Department">
                {log.employee.department.name}
              </DetailRow>
            )}

            {log.employee?.branch && (
              <DetailRow icon={Building2} label="Branch">
                {log.employee.branch.name}
              </DetailRow>
            )}

            <Separator />

            {/* Source */}
            <DetailRow icon={Fingerprint} label="Source">
              <div className="flex items-center gap-2">
                <Badge variant={SOURCE_VARIANT[log.source] ?? "outline"} className="text-xs">
                  {log.source}
                </Badge>
                <span className="text-xs text-muted-foreground">{SOURCE_LABELS[log.source]}</span>
              </div>
            </DetailRow>

            {log.kiosk && (
              <DetailRow icon={Monitor} label="Kiosk Terminal">
                {log.kiosk.name}
              </DetailRow>
            )}

            <Separator />

            {/* Geofence */}
            <DetailRow icon={MapPin} label="Geofence Status">
              {log.outsideGeofence ? (
                <span className="flex items-center gap-1.5 text-amber-600 font-medium">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Outside Geofence
                  {log.distanceMeters != null && (
                    <span className="text-muted-foreground font-normal text-xs">
                      ({log.distanceMeters.toLocaleString()}m from boundary)
                    </span>
                  )}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Inside Geofence
                </span>
              )}
            </DetailRow>

            {/* GPS coordinates */}
            {log.latitude != null && log.longitude != null ? (
              <DetailRow icon={Globe} label="GPS Location">
                <div className="space-y-1">
                  <p className="font-mono text-xs">
                    {log.latitude.toFixed(6)}, {log.longitude.toFixed(6)}
                  </p>
                  {mapsUrl && (
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                    >
                      Open in Google Maps
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </DetailRow>
            ) : (
              <DetailRow icon={Globe} label="GPS Location">
                <span className="text-muted-foreground">Not captured</span>
              </DetailRow>
            )}

            <Separator />

            {/* Network / device */}
            {log.ipAddress && (
              <DetailRow icon={Globe} label="IP Address">
                <span className="font-mono text-xs">{log.ipAddress}</span>
              </DetailRow>
            )}

            {ua && (
              <DetailRow icon={ua.mobile ? Smartphone : Monitor} label="Device">
                <div className="space-y-0.5">
                  <p>{ua.mobile ? "Mobile Device" : "Desktop / Laptop"}</p>
                  {ua.browser && (
                    <p className="text-xs text-muted-foreground">{ua.browser}</p>
                  )}
                </div>
              </DetailRow>
            )}

            <Separator />

            {/* Record metadata */}
            <DetailRow icon={Clock} label="Record ID">
              <span className="font-mono text-xs text-muted-foreground break-all">{log.id}</span>
            </DetailRow>

            <DetailRow icon={Clock} label="Recorded At">
              <span className="text-xs text-muted-foreground">
                {fmtDateTime(log.createdAt)}
              </span>
            </DetailRow>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
