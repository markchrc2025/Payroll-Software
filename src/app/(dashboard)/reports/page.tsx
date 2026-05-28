import { FileBarChart2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function ReportsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-sm text-muted-foreground">Payroll and compliance reports</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground gap-3">
          <FileBarChart2 className="h-12 w-12 opacity-30" />
          <p className="text-base font-medium">Coming Soon</p>
          <p className="text-sm max-w-xs">
            Payslips, BIR alphalists, payroll summaries, and SSS/PhilHealth/Pag-IBIG reports will appear here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
