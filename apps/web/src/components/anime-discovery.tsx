import { IconLoader2, IconSparkles } from "@tabler/icons-solidjs";
import { useQuery } from "@tanstack/solid-query";
import { Link } from "@tanstack/solid-router";
import { createMemo, createSignal, For, Show } from "solid-js";
import { Button, buttonVariants } from "~/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { type Anime, animeDetailsQueryOptions } from "~/lib/api";
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

interface AnimeDiscoveryPopoverProps {
  animeId: number;
  libraryIds: ReadonlySet<number>;
  triggerClass?: string;
}

export function AnimeDiscoveryPopover(props: AnimeDiscoveryPopoverProps) {
  const [open, setOpen] = createSignal(false);
  const query = useQuery(() => ({
    ...animeDetailsQueryOptions(props.animeId),
    enabled: open(),
  }));

  const related = createMemo(() => {
    const entries = query.data?.related_anime ?? [];
    return entries.filter((entry) => entry.id !== props.animeId);
  });
  const recommended = createMemo(() => {
    const relatedIds = new Set(related().map((entry) => entry.id));
    const entries = query.data?.recommended_anime ?? [];
    return entries.filter((entry) =>
      entry.id !== props.animeId && !relatedIds.has(entry.id)
    );
  });

  return (
    <Popover open={open()} onOpenChange={setOpen}>
      <PopoverTrigger
        as={Button}
        variant="ghost"
        size="icon"
        class={cn(
          "relative after:absolute after:-inset-2 h-7 w-7 shrink-0",
          props.triggerClass,
        )}
        aria-label="Show related and recommended anime"
      >
        <IconSparkles class="h-4 w-4" />
      </PopoverTrigger>
      <PopoverContent class="w-80 p-0">
        <div class="border-b border-border/70 px-4 py-3">
          <div class="text-sm font-medium text-foreground">
            Related And Discovery
          </div>
          <div class="mt-1 text-xs text-muted-foreground">
            Open matching library entries or jump to add them from AniList.
          </div>
        </div>

        <Show
          when={!query.isFetching}
          fallback={
            <div class="flex items-center justify-center px-4 py-8 text-sm text-muted-foreground">
              <IconLoader2 class="mr-2 h-4 w-4 animate-spin" />
              Loading discovery metadata...
            </div>
          }
        >
          <Show
            when={!query.error}
            fallback={
              <div class="px-4 py-6 text-sm text-muted-foreground">
                Could not load discovery metadata right now.
              </div>
            }
          >
            <div class="space-y-4 px-4 py-4">
              <Show when={related().length > 0}>
                <section class="space-y-2">
                  <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Franchise
                  </div>
                  <div class="space-y-2">
                    <For each={related().slice(0, 4)}>
                      {(entry) => (
                        <AnimeDiscoveryRow
                          entry={entry}
                          libraryIds={props.libraryIds}
                          onNavigate={() => setOpen(false)}
                        />
                      )}
                    </For>
                  </div>
                </section>
              </Show>

              <Show when={recommended().length > 0}>
                <section class="space-y-2">
                  <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Discovery
                  </div>
                  <div class="space-y-2">
                    <For each={recommended().slice(0, 4)}>
                      {(entry) => (
                        <AnimeDiscoveryRow
                          entry={entry}
                          libraryIds={props.libraryIds}
                          onNavigate={() => setOpen(false)}
                        />
                      )}
                    </For>
                  </div>
                </section>
              </Show>

              <Show when={related().length === 0 && recommended().length === 0}>
                <div class="text-sm text-muted-foreground">
                  No related or recommended anime available for this title yet.
                </div>
              </Show>
            </div>
          </Show>
        </Show>
      </PopoverContent>
    </Popover>
  );
}
