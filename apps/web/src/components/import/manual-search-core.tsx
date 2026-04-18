import {
  IconAlertTriangle,
  IconCalendarEvent,
  IconInfoCircle,
  IconLoader2,
  IconPlus,
  IconSearch,
} from "@tabler/icons-solidjs";
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { AnimeDiscoveryRow } from "~/components/anime-discovery";
import { Badge } from "~/components/ui/badge";
import { TextField, TextFieldInput } from "~/components/ui/text-field";
import { type AnimeSearchResult, createAnimeSearchQuery } from "~/lib/api";
import { animeDisplayTitle, animeSearchSubtitle } from "~/lib/anime-metadata";
import { createDebouncer } from "~/lib/debounce";
import { formatMatchConfidence } from "~/lib/scanned-file";
import { cn } from "~/lib/utils";

interface ManualSearchCoreProps {
  addedIndicator: "badge" | "text";
  autoFocusInput?: boolean;
  containerClass?: string;
  disableSelectionForAdded: boolean;
  emptyPrompt: string;
  existingIds?: ReadonlySet<number>;
  onSelect: (anime: AnimeSearchResult) => void;
}

export function ManualSearchCore(props: ManualSearchCoreProps) {
  // eslint-disable-next-line no-unassigned-vars -- SolidJS ref assigned by component mount
  let searchInputRef: HTMLInputElement | undefined;
  const [query, setQuery] = createSignal("");
  const [debouncedQuery, setDebouncedQuery] = createSignal("");
  const debouncer = createDebouncer(setDebouncedQuery, 500);

  createEffect(() => {
    debouncer.schedule(query());
    onCleanup(() => debouncer.cancel());
  });

  const search = createAnimeSearchQuery(() => debouncedQuery());
  const searchResults = createMemo(() => search.data?.results ?? []);
  const searchDegraded = createMemo(() => search.data?.degraded ?? false);
  const libraryIds = createMemo(() => {
    const existing = props.existingIds ? [...props.existingIds] : [];
    const discovered = searchResults()
      .filter((anime) => anime.already_in_library)
      .map((anime) => anime.id);
    return new Set([...existing, ...discovered]);
  });

  onMount(() => {
    if (props.autoFocusInput ?? true) {
      searchInputRef?.focus({ preventScroll: true });
    }
  });

  return (
    <div class="space-y-4">
      <div class="relative">
        <IconSearch class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <TextField value={query()} onChange={setQuery}>
          <TextFieldInput
            ref={searchInputRef}
            placeholder="Search for anime..."
            aria-label="Search anime title"
            class="pl-9"
          />
        </TextField>
        <Show when={search.isFetching}>
          <IconLoader2 class="absolute right-3 top-3 h-3 w-3 animate-spin text-muted-foreground" />
        </Show>
      </div>

      <Show when={searchDegraded()}>
        <div class="rounded border border-border/70 bg-muted/30 px-2.5 py-2 text-[11px] text-muted-foreground">
          <div class="flex items-start gap-2">
            <IconInfoCircle class="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              AniList is temporarily unavailable or rate-limited. Showing local library matches
              only.
            </span>
          </div>
        </div>
      </Show>

      <div class={cn("h-[300px] border rounded-none overflow-y-auto", props.containerClass)}>
        <Show
          when={debouncedQuery()}
          fallback={
            <div class="h-full flex flex-col items-center justify-center text-muted-foreground">
              <IconSearch class="h-8 w-8 mb-2 opacity-20" />
              <p class="text-sm">{props.emptyPrompt}</p>
            </div>
          }
        >
          <Show
            when={searchResults().length !== 0}
            fallback={
              <div class="h-full flex flex-col items-center justify-center text-muted-foreground">
                <IconAlertTriangle class="h-8 w-8 mb-2 opacity-20" />
                <p class="text-sm">No results found</p>
              </div>
            }
          >
            <div class="divide-y">
              <For each={searchResults()}>
                {(anime) => {
                  const isAdded = () => props.existingIds?.has(anime.id) ?? false;
                  return (
                    <button
                      type="button"
                      disabled={props.disableSelectionForAdded && isAdded()}
                      onClick={() => props.onSelect(anime)}
                      class={cn(
                        "w-full flex items-center gap-3 p-3 text-left transition-colors",
                        props.disableSelectionForAdded && isAdded()
                          ? "opacity-50 cursor-not-allowed bg-muted/20"
                          : "hover:bg-muted/50",
                      )}
                    >
                      <div class="h-10 w-10 shrink-0 rounded bg-muted overflow-hidden">
                        <Show when={anime.cover_image}>
                          <img
                            src={anime.cover_image}
                            alt={animeDisplayTitle(anime)}
                            loading="lazy"
                            class="h-full w-full object-cover"
                          />
                        </Show>
                      </div>
                      <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium truncate">{animeDisplayTitle(anime)}</p>
                        <p class="text-xs text-muted-foreground truncate">{anime.title.english}</p>
                        <div class="mt-1 flex flex-wrap gap-1 text-xs text-muted-foreground">
                          <Show when={searchDegraded()}>
                            <Badge
                              variant="outline"
                              class="h-5 px-1.5 text-xs border-warning/20 bg-warning/5 text-warning"
                            >
                              Local only
                            </Badge>
                          </Show>
                          <Show when={formatMatchConfidence(anime.match_confidence)}>
                            <Badge variant="outline" class="h-5 px-1.5 text-xs">
                              {formatMatchConfidence(anime.match_confidence)}
                            </Badge>
                          </Show>
                          <Show when={anime.format}>
                            <span>{anime.format}</span>
                          </Show>
                          <Show when={anime.episode_count}>
                            <span>{anime.episode_count} eps</span>
                          </Show>
                          <Show when={animeSearchSubtitle(anime)}>
                            <span class="inline-flex items-center gap-1">
                              <IconCalendarEvent class="h-3 w-3" />
                              {animeSearchSubtitle(anime)}
                            </span>
                          </Show>
                          <Show when={anime.genres?.length}>
                            <span>{anime.genres?.slice(0, 2).join(" / ")}</span>
                          </Show>
                        </div>
                        <Show when={anime.description}>
                          <p class="mt-1 text-xs text-muted-foreground line-clamp-2">
                            {anime.description}
                          </p>
                        </Show>
                        <Show when={anime.synonyms?.length}>
                          <p class="mt-1 text-xs text-muted-foreground line-clamp-2">
                            Also known as {anime.synonyms?.slice(0, 3).join(" • ")}
                          </p>
                        </Show>
                        <Show when={anime.related_anime?.length}>
                          <div class="mt-1 space-y-1">
                            <For each={anime.related_anime?.slice(0, 2)}>
                              {(related) => (
                                <AnimeDiscoveryRow
                                  entry={related}
                                  libraryIds={libraryIds()}
                                  compact
                                />
                              )}
                            </For>
                          </div>
                        </Show>
                        <Show when={anime.recommended_anime?.length}>
                          <div class="mt-1 space-y-1">
                            <For each={anime.recommended_anime?.slice(0, 2)}>
                              {(recommended) => (
                                <AnimeDiscoveryRow
                                  entry={recommended}
                                  libraryIds={libraryIds()}
                                  compact
                                />
                              )}
                            </For>
                          </div>
                        </Show>
                        <Show when={anime.match_reason}>
                          <p class="mt-1 text-xs text-muted-foreground line-clamp-2">
                            {anime.match_reason}
                          </p>
                        </Show>
                      </div>
                      <Show when={props.addedIndicator === "text"}>
                        <Show
                          when={isAdded()}
                          fallback={<IconPlus class="h-4 w-4 text-muted-foreground" />}
                        >
                          <span class="text-xs text-muted-foreground">Added</span>
                        </Show>
                      </Show>
                      <Show when={props.addedIndicator === "badge" && anime.already_in_library}>
                        <Badge variant="secondary">In library</Badge>
                      </Show>
                    </button>
                  );
                }}
              </For>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
}
