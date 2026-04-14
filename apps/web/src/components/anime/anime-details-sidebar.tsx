import { IconPlayerPlay } from "@tabler/icons-solidjs";
import { For, Show } from "solid-js";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import type { Anime } from "~/lib/api";

interface AnimeDetailsSidebarProps {
  anime: Anime;
}

export function AnimeDetailsSidebar(props: AnimeDetailsSidebarProps) {
  const compactNumber = new Intl.NumberFormat(undefined, { notation: "compact" });

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

      <Show
        when={
          props.anime.source ||
          props.anime.duration ||
          props.anime.rating ||
          props.anime.rank ||
          props.anime.popularity ||
          props.anime.members ||
          props.anime.favorites
        }
      >
        <Card>
          <CardContent class="p-3">
            <dl class="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <Show when={props.anime.source}>
                <div>
                  <dt class="text-muted-foreground">Source</dt>
                  <dd class="font-medium">{props.anime.source}</dd>
                </div>
              </Show>
              <Show when={props.anime.duration}>
                <div>
                  <dt class="text-muted-foreground">Duration</dt>
                  <dd class="font-medium">{props.anime.duration}</dd>
                </div>
              </Show>
              <Show when={props.anime.rating}>
                <div class="col-span-2">
                  <dt class="text-muted-foreground">Rating</dt>
                  <dd class="font-medium">{props.anime.rating}</dd>
                </div>
              </Show>
              <Show when={props.anime.rank}>
                <div>
                  <dt class="text-muted-foreground">Rank</dt>
                  <dd class="font-medium">#{props.anime.rank}</dd>
                </div>
              </Show>
              <Show when={props.anime.popularity}>
                <div>
                  <dt class="text-muted-foreground">Popularity</dt>
                  <dd class="font-medium">#{props.anime.popularity}</dd>
                </div>
              </Show>
              <Show when={props.anime.members}>
                <div>
                  <dt class="text-muted-foreground">Members</dt>
                  <dd class="font-medium">{compactNumber.format(props.anime.members ?? 0)}</dd>
                </div>
              </Show>
              <Show when={props.anime.favorites}>
                <div>
                  <dt class="text-muted-foreground">Favorites</dt>
                  <dd class="font-medium">{compactNumber.format(props.anime.favorites ?? 0)}</dd>
                </div>
              </Show>
            </dl>
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
