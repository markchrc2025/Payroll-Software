import { CalendarClock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function AttendancePage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Time &amp; Attendance</h1>
        <p className="text-sm text-muted-foreground">Daily Time Record management</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground gap-3">
          <CalendarClock className="h-12 w-12 opacity-30" />
          <p className="text-base font-medium">Coming Soon</p>
          <p className="text-sm max-w-xs">
            DTR upload, approval workflows, and shift management will appear here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
