import { Laptop, Moon, Sun } from "@phosphor-icons/react";
import { useTheme } from "~/components/shared/theme-provider";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

export function ModeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-3 overflow-hidden rounded-none px-3 py-2 text-left text-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground group-data-[collapsible=icon]:!size-9 group-data-[collapsible=icon]:!p-2">
        <div className="relative h-4 w-4 shrink-0">
          <Sun className="absolute inset-0 h-4 w-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute inset-0 h-4 w-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
        </div>
        <span className="truncate group-data-[collapsible=icon]:hidden">Theme ({theme})</span>
        <span className="sr-only">Toggle theme</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun className="mr-2 size-4" />
          <span>Light</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon className="mr-2 size-4" />
          <span>Dark</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <Laptop className="mr-2 size-4" />
          <span>System</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
