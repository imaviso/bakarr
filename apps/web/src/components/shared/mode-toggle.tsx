import { Laptop, Moon, Sun } from "@phosphor-icons/react";
import { useTheme } from "@/components/shared/theme-provider";
import { Button } from "@/components/ui/button";

import { DropdownMenu, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function ModeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenuTrigger>
      <Button
        variant="ghost"
        className="h-9 w-full justify-start gap-3 rounded-none px-3 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground group-data-[collapsible=icon]:!size-9 group-data-[collapsible=icon]:!p-2 group-data-[collapsible=icon]:justify-center"
      >
        <div className="relative h-4 w-4 shrink-0">
          <Sun className="absolute inset-0 h-4 w-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute inset-0 h-4 w-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
        </div>
        <span className="truncate group-data-[collapsible=icon]:hidden">Theme ({theme})</span>
        <span className="sr-only">Toggle theme</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuItem onAction={() => setTheme("light")}>
          <Sun className="mr-2 size-4" />
          <span>Light</span>
        </DropdownMenuItem>
        <DropdownMenuItem onAction={() => setTheme("dark")}>
          <Moon className="mr-2 size-4" />
          <span>Dark</span>
        </DropdownMenuItem>
        <DropdownMenuItem onAction={() => setTheme("system")}>
          <Laptop className="mr-2 size-4" />
          <span>System</span>
        </DropdownMenuItem>
      </DropdownMenu>
    </DropdownMenuTrigger>
  );
}
