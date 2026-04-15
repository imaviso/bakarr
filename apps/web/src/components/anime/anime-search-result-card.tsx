import { IconCalendarEvent, IconCheck, IconDeviceTv, IconPlus } from "@tabler/icons-solidjs";
import { Show } from "solid-js";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import type { AnimeSearchResult } from "~/lib/api";
import { animeAltTitles, animeDisplayTitle, animeSearchSubtitle } from "~/lib/anime-metadata";
import { formatMatchConfidence } from "~/lib/scanned-file";
import { cn } from "~/lib/utils";

interface AnimeSearchResultCardProps {
  anime: AnimeSearchResult;
  added: boolean;
  onSelect: (anime: AnimeSearchResult) => void;
  showSearchMeta?: boolean;
  searchDegraded?: boolean;
  compact?: boolean;
}

export function AnimeSearchResultCard(props: AnimeSearchResultCardProps) {
  return (
    <Card class="overflow-hidden flex flex-col transition-colors hover:border-primary/50 group">
      <div class="relative aspect-[2/3] w-full bg-muted overflow-hidden">
        <Show
          when={props.anime.cover_image}
          fallback={
            <div class="absolute inset-0 flex items-center justify-center">
              <IconDeviceTv class="h-12 w-12 text-muted-foreground/30" />
            </div>
          }
        >
          <img
            src={props.anime.cover_image}
            alt={animeDisplayTitle(props.anime)}
            class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        </Show>
        <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
          <Button
            size="sm"
            variant={props.added ? "secondary" : "default"}
            class="w-full gap-2"
            disabled={props.added}
            onClick={() => props.onSelect(props.anime)}
          >
            <Show
              when={props.added}
              fallback={
                <>
                  <IconPlus class="h-4 w-4" />
                  Add to Library
                </>
              }
            >
              <IconCheck class="h-4 w-4" />
              Already Added
            </Show>
          </Button>
        </div>
      </div>
      <CardContent class={cn("p-4 flex-1", props.compact ? "p-3" : "p-4")}>
        <h3
          class={cn("font-medium leading-tight line-clamp-2 mb-1", props.compact ? "text-sm" : "")}
          title={props.anime.title.romaji}
        >
          {animeDisplayTitle(props.anime)}
        </h3>
        <Show when={!props.compact && animeAltTitles(props.anime).slice(1).join(" \u2022 ")}>
          <p
            class="text-xs text-muted-foreground line-clamp-1 mb-2"
            title={animeAltTitles(props.anime).slice(1).join(" \u2022 ")}
          >
            {animeAltTitles(props.anime).slice(1).join(" \u2022 ")}
          </p>
        </Show>
        <div class="flex flex-wrap gap-1.5 mt-auto">
          <Show when={props.searchDegraded}>
            <Badge
              variant="outline"
              class="text-xs h-5 px-1.5 font-normal border-warning/20 bg-warning/5 text-warning"
            >
              Local only
            </Badge>
          </Show>
          <Show when={props.showSearchMeta && formatMatchConfidence(props.anime.match_confidence)}>
            {(label) => (
              <Badge
                variant="outline"
                class="text-xs h-5 px-1.5 font-normal border-info/30 text-info"
              >
                {label()}
              </Badge>
            )}
          </Show>
          <Show when={props.anime.format}>
            <Badge variant="outline" class="text-xs h-5 px-1.5 font-normal">
              {props.anime.format}
            </Badge>
          </Show>
          <Show when={props.anime.episode_count}>
            <Badge variant="outline" class="text-xs h-5 px-1.5 font-normal">
              {props.anime.episode_count} eps
            </Badge>
          </Show>
          <Show when={props.anime.status}>
            <Badge
              variant="outline"
              class={cn(
                "text-xs h-5 px-1.5 font-normal capitalize",
                props.anime.status?.toLowerCase() === "releasing"
                  ? "text-success border-success/30"
                  : "text-muted-foreground",
              )}
            >
              {props.anime.status?.replace("_", " ").toLowerCase()}
            </Badge>
          </Show>
          <Show when={animeSearchSubtitle(props.anime)}>
            {(startLabel) => (
              <Badge variant="outline" class="text-xs h-5 px-1.5 font-normal">
                <IconCalendarEvent class="mr-1 h-3 w-3" />
                {startLabel()}
              </Badge>
            )}
          </Show>
          <Show when={props.anime.genres?.length}>
            <Badge variant="outline" class="text-xs h-5 px-1.5 font-normal">
              {props.anime.genres?.slice(0, 2).join(" / ")}
            </Badge>
          </Show>
        </div>
        <Show when={!props.compact && props.anime.description}>
          <p class="mt-2 text-xs text-muted-foreground line-clamp-3">{props.anime.description}</p>
        </Show>
      </CardContent>
    </Card>
  );
}
