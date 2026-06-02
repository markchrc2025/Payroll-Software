"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { ChevronDown, LogOut, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  displayName: string;
  initials: string;
};

export function UserMenu({ displayName, initials }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onProfileClick() {
    router.push("/profile");
  }

  function onSignOutClick() {
    startTransition(async () => {
      await signOut({ callbackUrl: "/login" });
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Open user menu"
        className="group inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors outline-none"
      >
        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-[11px] font-semibold text-primary ring-1 ring-primary/20">
          {initials}
        </div>
        <span className="hidden lg:inline max-w-[140px] truncate font-medium text-foreground/80">
          {displayName}
        </span>
        <ChevronDown className="hidden lg:inline h-4 w-4 text-muted-foreground group-hover:text-foreground" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-48">
        <DropdownMenuLabel className="truncate">{displayName}</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={onProfileClick}>
          <User className="h-4 w-4" />
          <span>Profile</span>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={onSignOutClick} disabled={isPending}>
          <LogOut className="h-4 w-4" />
          <span>{isPending ? "Signing out..." : "Sign Out"}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
