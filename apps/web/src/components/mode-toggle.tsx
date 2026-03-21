import { useColorMode } from "@kobalte/core";
import { IconDeviceLaptop, IconMoon, IconSun } from "@tabler/icons-solidjs";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

export function ModeToggle() {
  const { setColorMode } = useColorMode();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger class="flex w-full items-center gap-3 overflow-hidden rounded-none px-3 py-2 text-left text-sm text-muted-foreground outline-none transition-colors hover:bg-accent/40 hover:text-foreground group-data-[collapsible=icon]:!size-9 group-data-[collapsible=icon]:!p-2">
        <div class="relative h-4 w-4 shrink-0 opacity-50">
          <IconSun class="absolute inset-0 h-4 w-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
          <IconMoon class="absolute inset-0 h-4 w-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
        </div>
        <span class="truncate group-data-[collapsible=icon]:hidden">Theme</span>
        <span class="sr-only">Toggle theme</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => setColorMode("light")}>
          <IconSun class="mr-2 size-4" />
          <span>Light</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setColorMode("dark")}>
          <IconMoon class="mr-2 size-4" />
          <span>Dark</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setColorMode("system")}>
          <IconDeviceLaptop class="mr-2 size-4" />
          <span>System</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
