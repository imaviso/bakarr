import { Link } from "@tanstack/solid-router";
import { createMemo, For, Show } from "solid-js";
import { buttonVariants } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import type { Anime } from "~/lib/api";
import {
  animeDiscoverySubtitle,
  animeDisplayTitle,
} from "~/lib/anime-metadata";
import { cn } from "~/lib/utils";

type DiscoveryEntry = NonNullable<Anime["related_anime"]>[number];

interface AnimeDiscoveryRowProps {
  entry: DiscoveryEntry;
  libraryIds: ReadonlySet<number>;
  compact?: boolean;
  onNavigate?: () => void;
}

export function AnimeDiscoveryRow(props: AnimeDiscoveryRowProps) {
  const subtitle = createMemo(() =>
    animeDiscoverySubtitle(props.entry).join(" - ")
  );
  const isInLibrary = createMemo(() => props.libraryIds.has(props.entry.id));

  return (
    <div
      class={cn(
        "flex items-start gap-2 border border-border/60 bg-muted/20 text-xs",
        props.compact ? "p-1.5" : "p-2",
      )}
    >
      <Show when={props.entry.cover_image}>
        <img
          src={props.entry.cover_image}
          alt={animeDisplayTitle(props.entry)}
          class={cn(
            "shrink-0 border border-border/60 object-cover",
            props.compact ? "h-10 w-7" : "h-12 w-8",
          )}
        />
      </Show>
      <div class="min-w-0 flex-1">
        <div class="font-medium text-foreground">
          {animeDisplayTitle(props.entry)}
        </div>
        <Show when={subtitle()}>
          <div class="mt-1 text-muted-foreground">{subtitle()}</div>
        </Show>
      </div>
      <Show
        when={isInLibrary()}
        fallback={
          <Link
            to="/anime/add"
            search={{ id: props.entry.id.toString() }}
            onClick={props.onNavigate}
            aria-label={`Add ${animeDisplayTitle(props.entry)}`}
            class={buttonVariants({
              size: "sm",
              class: props.compact ? "h-6 px-1.5 text-xs" : "h-7 px-2 text-xs",
            })}
          >
            Add
          </Link>
        }
      >
        <Link
          to="/anime/$id"
          params={{ id: props.entry.id.toString() }}
          onClick={props.onNavigate}
          aria-label={`Open ${animeDisplayTitle(props.entry)}`}
          class={buttonVariants({
            size: "sm",
            variant: "outline",
            class: props.compact ? "h-6 px-1.5 text-xs" : "h-7 px-2 text-xs",
          })}
        >
          Open
        </Link>
      </Show>
    </div>
  );
}

interface AnimeDiscoverySectionProps {
  anime: Anime;
  libraryIds: ReadonlySet<number>;
}

export function AnimeDiscoverySection(props: AnimeDiscoverySectionProps) {
  const related = createMemo(() => {
    const entries = props.anime.related_anime ?? [];
    return entries.filter((entry) => entry.id !== props.anime.id);
  });
  const recommended = createMemo(() => {
    const relatedIds = new Set(related().map((entry) => entry.id));
    const entries = props.anime.recommended_anime ?? [];
    return entries.filter((entry) =>
      entry.id !== props.anime.id && !relatedIds.has(entry.id)
    );
  });

  const hasContent = createMemo(() =>
    related().length > 0 || recommended().length > 0
  );

  return (
    <Show when={hasContent()}>
      <Card>
        <CardHeader class="pb-3">
          <CardTitle class="text-base">Related & Recommended</CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <Show when={related().length > 0}>
            <section class="space-y-2">
              <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Franchise
              </div>
              <div class="space-y-2">
                <For each={related()}>
                  {(entry) => (
                    <AnimeDiscoveryRow
                      entry={entry}
                      libraryIds={props.libraryIds}
                    />
                  )}
                </For>
              </div>
            </section>
          </Show>

          <Show when={recommended().length > 0}>
            <section class="space-y-2">
              <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Recommended
              </div>
              <div class="space-y-2">
                <For each={recommended().slice(0, 6)}>
                  {(entry) => (
                    <AnimeDiscoveryRow
                      entry={entry}
                      libraryIds={props.libraryIds}
                    />
                  )}
                </For>
              </div>
            </section>
          </Show>
        </CardContent>
      </Card>
    </Show>
  );
}
