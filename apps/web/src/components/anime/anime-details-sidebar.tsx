import { IconPlayerPlay } from "@tabler/icons-solidjs";
import { For, Show } from "solid-js";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import type { Anime } from "~/lib/api";

interface AnimeDetailsSidebarProps {
  anime: Anime;
}

export function AnimeDetailsSidebar(props: AnimeDetailsSidebarProps) {
  return (
    <div class="space-y-4">
      <Card class="overflow-hidden">
        <Show
          when={props.anime.cover_image}
          fallback={
            <div class="w-full aspect-[2/3] bg-muted flex items-center justify-center">
              <IconPlayerPlay class="h-16 w-16 text-muted-foreground/30" />
            </div>
          }
        >
          <img
            src={props.anime.cover_image}
            alt={props.anime.title.english || props.anime.title.romaji}
            loading="lazy"
            class="w-full aspect-[2/3] object-cover"
          />
        </Show>
      </Card>

      <Show when={props.anime.score}>
        <Card>
          <CardContent class="p-3 flex items-center justify-between">
            <span class="text-sm font-medium">Score</span>
            <span class="font-bold text-lg">{props.anime.score}</span>
          </CardContent>
        </Card>
      </Show>

      <Show when={props.anime.studios && (props.anime.studios?.length ?? 0) > 0}>
        <div class="space-y-1.5">
          <h2 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Studios
          </h2>
          <div class="flex flex-wrap gap-1">
            <For each={props.anime.studios}>
              {(studio) => (
                <Badge variant="outline" class="text-xs">
                  {studio}
                </Badge>
              )}
            </For>
          </div>
        </div>
      </Show>

      <Show when={props.anime.genres && (props.anime.genres?.length ?? 0) > 0}>
        <div class="space-y-1.5">
          <h2 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Genres
          </h2>
          <div class="flex flex-wrap gap-1">
            <For each={props.anime.genres}>
              {(genre) => (
                <Badge variant="secondary" class="text-xs">
                  {genre}
                </Badge>
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}
