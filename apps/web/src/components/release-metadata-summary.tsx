import { IconExternalLink } from "@tabler/icons-solidjs";
import { For, Show } from "solid-js";
import type { ReleaseFlag } from "~/lib/release-metadata";
import { releaseFlagBadgeClass } from "~/lib/release-metadata";

interface ReleaseMetadataSummaryProps {
  flags?: readonly ReleaseFlag[] | undefined;
  sourceSummary?: string | undefined;
  parsedSummary?: string | undefined;
  sourceUrl?: string | undefined;
  compact?: boolean | undefined;
}

export function ReleaseMetadataSummary(props: ReleaseMetadataSummaryProps) {
  return (
    <div class={props.compact ? "flex flex-col gap-0.5" : "flex flex-col gap-1"}>
      <Show when={(props.flags?.length ?? 0) > 0}>
        <div class="flex items-center gap-2 flex-wrap">
          <For each={props.flags}>
            {(flag) => (
              <span
                class={`inline-flex items-center rounded-none border h-4 px-1 text-xs ${releaseFlagBadgeClass(
                  flag.kind,
                )}`}
              >
                {flag.label}
              </span>
            )}
          </For>
        </div>
      </Show>
      <Show when={props.sourceSummary}>
        <div class="text-xs text-muted-foreground leading-tight">{props.sourceSummary}</div>
      </Show>
      <Show when={props.parsedSummary || props.sourceUrl}>
        <div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground leading-tight">
          <Show when={props.parsedSummary}>
            <span>{props.parsedSummary}</span>
          </Show>
          <Show when={props.sourceUrl}>
            <a
              href={props.sourceUrl}
              target="_blank"
              rel="noreferrer"
              class="inline-flex items-center gap-1 text-primary hover:text-primary/80"
            >
              <IconExternalLink class="h-3 w-3" />
              Source
            </a>
          </Show>
        </div>
      </Show>
    </div>
  );
}
