import { IconExternalLink } from "@tabler/icons-solidjs";
import type { DownloadSelectionKind } from "@bakarr/shared";
import { For, Show } from "solid-js";
import { Badge } from "~/components/ui/badge";
import {
  releaseConfidenceBadgeClass,
  selectionKindBadgeClass,
  type ReleaseConfidenceMetadata,
} from "~/lib/release-selection";
import { cn } from "~/lib/utils";

interface ReleaseSeaDexMetaProps {
  notes?: string | undefined;
  tags?: string[] | undefined;
  comparisonUrl?: string | undefined;
  class?: string | undefined;
  tagClass?: string | undefined;
}

export function ReleaseSeaDexMeta(props: ReleaseSeaDexMetaProps) {
  return (
    <Show when={props.notes || props.tags?.length || props.comparisonUrl}>
      <div class={cn("flex flex-col gap-1 text-xs text-muted-foreground", props.class)}>
        <Show when={props.notes}>
          <span class="line-clamp-2">{props.notes}</span>
        </Show>
        <Show when={props.tags?.length}>
          <div class="flex flex-wrap gap-1">
            <For each={(props.tags ?? []).slice(0, 4)}>
              {(tag) => (
                <Badge
                  variant="secondary"
                  class={cn(
                    "h-4 px-1 text-xs bg-muted/40 text-muted-foreground border-transparent",
                    props.tagClass,
                  )}
                >
                  {tag}
                </Badge>
              )}
            </For>
          </div>
        </Show>
        <Show when={props.comparisonUrl}>
          <a
            href={props.comparisonUrl}
            target="_blank"
            rel="noreferrer"
            class="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 w-fit"
          >
            <IconExternalLink class="h-3 w-3" /> Compare notes
          </a>
        </Show>
      </div>
    </Show>
  );
}

interface ReleaseSelectionMetaProps {
  selectionKind?: DownloadSelectionKind | undefined;
  selectionLabel?: string | undefined;
  selectionSummary?: string | undefined;
  selectionDetail?: string | undefined;
  confidence?: ReleaseConfidenceMetadata | undefined;
  class?: string | undefined;
  selectionClass?: string | undefined;
  confidenceClass?: string | undefined;
  detailClass?: string | undefined;
}

export function ReleaseSelectionMeta(props: ReleaseSelectionMetaProps) {
  return (
    <>
      <Show when={props.selectionSummary}>
        <div
          class={cn(
            "flex flex-wrap items-center gap-1.5 text-xs leading-tight",
            props.class,
            props.selectionClass,
          )}
        >
          <Show when={props.selectionLabel}>
            <Badge
              variant="secondary"
              class={cn(
                "h-4 px-1.5 border-transparent",
                selectionKindBadgeClass(props.selectionKind),
              )}
            >
              {props.selectionLabel}
            </Badge>
          </Show>
          <Show when={props.selectionDetail}>
            <div class={cn("text-muted-foreground", props.detailClass)}>
              {props.selectionDetail}
            </div>
          </Show>
        </div>
      </Show>
      <Show when={props.confidence}>
        {(confidence) => (
          <div
            class={cn(
              "flex flex-wrap items-center gap-1.5 text-xs leading-tight",
              props.class,
              props.confidenceClass,
            )}
          >
            <Badge
              variant="secondary"
              class={cn(
                "h-4 px-1.5 border-transparent",
                releaseConfidenceBadgeClass(confidence().tone),
              )}
            >
              {confidence().label}
            </Badge>
            <div class="text-muted-foreground">{confidence().reason}</div>
          </div>
        )}
      </Show>
    </>
  );
}
