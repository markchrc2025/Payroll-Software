import { Settings } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Company and system configuration</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground gap-3">
          <Settings className="h-12 w-12 opacity-30" />
          <p className="text-base font-medium">Coming Soon</p>
          <p className="text-sm max-w-xs">
            Roles, permissions, statutory rules, pay components, shift schedules, and work locations will be managed here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
