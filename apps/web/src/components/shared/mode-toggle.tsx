import { RiComputerLine, RiMoonLine, RiSunLine } from "@remixicon/react";
import { useTheme } from "@/components/shared/theme-provider";

import { DropdownMenu, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";

export function ModeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenuTrigger>
      <SidebarMenuButton className="h-9">
        <span className="relative h-4 w-4 shrink-0">
          <RiSunLine className="absolute inset-0 h-4 w-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
          <RiMoonLine className="absolute inset-0 h-4 w-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
        </span>
        <span>Theme ({theme})</span>
      </SidebarMenuButton>
      <DropdownMenu>
        <DropdownMenuItem onAction={() => setTheme("light")}>
          <RiSunLine className="mr-2 size-4" />
          <span>Light</span>
        </DropdownMenuItem>
        <DropdownMenuItem onAction={() => setTheme("dark")}>
          <RiMoonLine className="mr-2 size-4" />
          <span>Dark</span>
        </DropdownMenuItem>
        <DropdownMenuItem onAction={() => setTheme("system")}>
          <RiComputerLine className="mr-2 size-4" />
          <span>System</span>
        </DropdownMenuItem>
      </DropdownMenu>
    </DropdownMenuTrigger>
  );
}
