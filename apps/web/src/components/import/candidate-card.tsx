import { IconCheck, IconFile } from "@tabler/icons-solidjs";
import { For, Show } from "solid-js";
import { AnimeDiscoveryRow } from "~/components/anime-discovery";
import { Badge } from "~/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import type { AnimeSearchResult } from "~/lib/api";
import { animeDisplayTitle, animeSearchSubtitle } from "~/lib/anime-metadata";
import { cn } from "~/lib/utils";

interface CandidateCardProps {
  candidate: AnimeSearchResult;
  libraryIds: ReadonlySet<number>;
  isSelected: boolean;
  isLocal: boolean;
  isManual: boolean;
  onToggle: () => void;
  class?: string;
}

export function CandidateCard(props: CandidateCardProps) {
  return (
    <div
      class={cn(
        "relative overflow-hidden border bg-background transition-colors hover:shadow-sm",
        props.isSelected
          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
          : "border-border hover:border-primary/50",
        props.class,
      )}
    >
      <button
        type="button"
        class="flex w-full gap-3 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        onClick={props.onToggle}
        aria-pressed={props.isSelected}
      >
        <div class="relative h-16 w-12 shrink-0 overflow-hidden bg-muted shadow-sm">
          <Show
            when={props.candidate.cover_image}
            fallback={
              <div class="flex h-full w-full items-center justify-center bg-muted/50">
                <IconFile class="h-4 w-4 text-muted-foreground/50" />
              </div>
            }
          >
            <img
              src={props.candidate.cover_image}
              alt={animeDisplayTitle(props.candidate)}
              class="h-full w-full object-cover"
            />
          </Show>
          <Show when={props.isSelected}>
            <div class="absolute inset-0 flex items-center justify-center bg-primary/20 backdrop-blur-[1px]">
              <IconCheck class="h-5 w-5 text-white drop-shadow-sm" />
            </div>
          </Show>
        </div>

        <div class="min-w-0 flex-1 space-y-1">
          <Tooltip>
            <TooltipTrigger as="span">
              <span class="block line-clamp-2 text-sm font-medium leading-tight">
                {animeDisplayTitle(props.candidate)}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>{animeDisplayTitle(props.candidate)}</p>
            </TooltipContent>
          </Tooltip>

          <div class="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <Show when={!props.isLocal}>
              <Badge
                variant="secondary"
                class="h-4 px-1 text-xs bg-info/10 text-info border-info/20"
              >
                New
              </Badge>
            </Show>
            <Show when={props.isManual}>
              <Badge
                variant="secondary"
                class="h-4 px-1 text-xs bg-accent/10 text-accent border-accent/20"
              >
                Manual
              </Badge>
            </Show>
            <span class="font-mono">ID: {props.candidate.id}</span>
            <Show when={props.candidate.format}>
              <Badge variant="outline" class="h-4 px-1 text-xs">
                {props.candidate.format}
              </Badge>
            </Show>
            <Show when={animeSearchSubtitle(props.candidate)}>
              <Badge variant="outline" class="h-4 px-1 text-xs">
                {animeSearchSubtitle(props.candidate)}
              </Badge>
            </Show>
          </div>

          <Show when={props.candidate.match_reason}>
            <p class="text-xs text-muted-foreground line-clamp-2">{props.candidate.match_reason}</p>
          </Show>
          <Show when={props.candidate.genres?.length}>
            <p class="text-xs text-muted-foreground line-clamp-1">
              {props.candidate.genres?.slice(0, 2).join(" / ")}
            </p>
          </Show>
          <Show when={props.candidate.synonyms?.length}>
            <p class="text-xs text-muted-foreground line-clamp-2">
              Also known as {props.candidate.synonyms?.slice(0, 2).join(" • ")}
            </p>
          </Show>
        </div>
      </button>

      <Show
        when={props.candidate.related_anime?.length || props.candidate.recommended_anime?.length}
      >
        <div class="space-y-1 border-t border-border/60 bg-muted/20 px-3 py-2">
          <Show when={props.candidate.related_anime?.length}>
            <For each={props.candidate.related_anime?.slice(0, 2)}>
              {(related) => (
                <AnimeDiscoveryRow entry={related} libraryIds={props.libraryIds} compact />
              )}
            </For>
          </Show>
          <Show when={props.candidate.recommended_anime?.length}>
            <For each={props.candidate.recommended_anime?.slice(0, 2)}>
              {(recommended) => (
                <AnimeDiscoveryRow entry={recommended} libraryIds={props.libraryIds} compact />
              )}
            </For>
          </Show>
        </div>
      </Show>
    </div>
  );
}
