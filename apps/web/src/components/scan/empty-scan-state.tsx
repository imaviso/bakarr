import { IconFolder } from "@tabler/icons-solidjs";
import { Show } from "solid-js";

export function EmptyScanState(props: { hasOutstandingMatches: boolean; isScanning: boolean }) {
  return (
    <div class="flex min-h-[50vh] flex-col items-center justify-center border border-dashed border-border/70 bg-background/60 px-6 text-center shadow-sm">
      <div class="flex h-16 w-16 items-center justify-center border border-info/20 bg-info/10">
        <IconFolder class="h-8 w-8 text-info" />
      </div>
      <p class="mt-5 text-base font-medium text-foreground">
        <Show
          when={props.isScanning || props.hasOutstandingMatches}
          fallback="No unmapped folders found"
        >
          Scanning for folders...
        </Show>
      </p>
      <p class="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        <Show
          when={props.isScanning || props.hasOutstandingMatches}
          fallback="Everything under your library root is already mapped to anime entries."
        >
          We&apos;re checking your library root for folders that are not linked yet, then matching
          them in the background one by one.
        </Show>
      </p>
    </div>
  );
}
