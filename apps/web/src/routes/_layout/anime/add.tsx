import {
  IconAlertTriangle,
  IconCalendarEvent,
  IconCheck,
  IconDeviceTv,
  IconInfoCircle,
  IconLoader2,
  IconPlus,
  IconSearch,
} from "@tabler/icons-solidjs";
import { createFileRoute } from "@tanstack/solid-router";
import { createEffect, createMemo, createSignal, For, onCleanup, Show, Suspense } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import * as v from "valibot";
import { AddAnimeDialog } from "~/components/add-anime-dialog";
import { AnimeDiscoveryRow } from "~/components/anime-discovery";
import { GeneralError } from "~/components/general-error";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { TextField, TextFieldInput } from "~/components/ui/text-field";
import {
  type AnimeSearchResult,
  createAnimeByAnilistIdQuery,
  createAnimeListQuery,
  createAnimeSearchQuery,
  profilesQueryOptions,
  releaseProfilesQueryOptions,
  systemConfigQueryOptions,
} from "~/lib/api";
import { animeAltTitles, animeDisplayTitle, animeSearchSubtitle } from "~/lib/anime-metadata";
import { createDebouncer } from "~/lib/debounce";
import { formatMatchConfidence } from "~/lib/scanned-file";
import { cn } from "~/lib/utils";

const searchSchema = v.object({
  id: v.optional(v.pipe(v.string(), v.transform(Number), v.integer())),
});

export const Route = createFileRoute("/_layout/anime/add")({
  validateSearch: searchSchema,
  loader: async ({ context: { queryClient } }) => {
    await Promise.all([
      queryClient.ensureQueryData(profilesQueryOptions()),
      queryClient.ensureQueryData(releaseProfilesQueryOptions()),
      queryClient.ensureQueryData(systemConfigQueryOptions()),
    ]);
  },
  component: AddAnimePage,
  errorComponent: GeneralError,
});

function AddAnimePage() {
  const search = Route.useSearch();
  const [query, setQuery] = createSignal("");
  const [debouncedQuery, setDebouncedQuery] = createSignal("");
  const debouncer = createDebouncer(setDebouncedQuery, 500);
  const [selectedAnime, setSelectedAnime] = createSignal<AnimeSearchResult | null>(null);

  // Get ID from search params (now properly typed via Valibot transform)
  const anilistId = () => {
    const searchParams = search();
    return searchParams.id ?? null;
  };

  // Fetch anime by ID if provided in URL
  const anilistIdQuery = createAnimeByAnilistIdQuery(anilistId);

  // Auto-select anime when fetched by ID
  createEffect(() => {
    if (anilistIdQuery.data && !selectedAnime()) {
      setSelectedAnime(anilistIdQuery.data);
    }
  });

  // Regular search functionality
  createEffect(() => {
    debouncer.schedule(query());
    onCleanup(() => debouncer.cancel());
  });

  const searchQuery = createAnimeSearchQuery(debouncedQuery);
  const [searchResults, setSearchResults] = createStore<AnimeSearchResult[]>([]);
  createEffect(() => {
    setSearchResults(reconcile(searchQuery.data?.results ?? [], { key: "id", merge: true }));
  });
  const canSearch = createMemo(() => debouncedQuery().trim().length >= 3);
  const searchDegraded = createMemo(() => searchQuery.data?.degraded ?? false);
  const animeListQuery = createAnimeListQuery();
  const libraryIds = createMemo(
    () => new Set((animeListQuery.data ?? []).map((anime) => anime.id)),
  );

  return (
    <div class="space-y-6">
      <div class="border-b border-border pb-4 mb-6 flex flex-col gap-4">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight text-foreground">Add New Anime</h1>
          <div class="text-sm text-muted-foreground mt-1">
            Search and add new anime to your library
          </div>
        </div>
        <div class="relative max-w-xl">
          <IconSearch class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <TextField class="w-full" value={query()} onChange={setQuery}>
            <TextFieldInput
              placeholder="Search for anime by title..."
              aria-label="Search for anime by title"
              class="pl-9 h-11"
              autofocus
            />
          </TextField>
          <Show when={searchQuery.isFetching}>
            <div class="absolute right-3 top-1/2 -translate-y-1/2">
              <IconLoader2 class="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </Show>
        </div>
      </div>

      <div class="space-y-4">
        <Show when={canSearch() && searchDegraded()}>
          <div class="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <IconInfoCircle class="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              AniList is temporarily unavailable or rate-limited. Showing local library matches
              only.
            </p>
          </div>
        </Show>
        <div
          class={cn(
            "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 transition-opacity duration-200",
            canSearch() && searchQuery.isFetching && searchResults.length > 0 && "opacity-60",
          )}
        >
          <Show when={!canSearch()}>
            <div class="col-span-full flex flex-col items-center justify-center py-20 text-muted-foreground border-2 border-dashed rounded-lg bg-muted/10">
              <IconSearch class="h-12 w-12 mb-4 opacity-50" />
              <h2 class="font-medium text-lg">Search for your next anime</h2>
              <p class="text-sm mt-1">Type in the search bar above to calculate metadata</p>
            </div>
          </Show>

          <Show when={canSearch() && !!searchQuery.error}>
            <div class="col-span-full p-8 text-center text-destructive bg-destructive/10 rounded-lg">
              <p>Failed to search anime. Please try again.</p>
              <p class="text-sm mt-2 opacity-80">
                {searchQuery.error instanceof Error
                  ? searchQuery.error.message
                  : String(searchQuery.error)}
              </p>
            </div>
          </Show>

          <Show
            when={
              canSearch() &&
              !searchQuery.error &&
              searchQuery.isFetching &&
              searchResults.length === 0
            }
          >
            <For each={[1, 2, 3, 4, 5, 6, 7, 8]}>
              {() => (
                <div class="space-y-3">
                  <Skeleton class="aspect-[2/3] w-full rounded-lg" />
                  <div class="space-y-2">
                    <Skeleton class="h-4 w-3/4" />
                    <Skeleton class="h-3 w-1/2" />
                  </div>
                </div>
              )}
            </For>
          </Show>

          <Show when={canSearch() && !searchQuery.error}>
            <For each={searchResults}>
              {(anime) => {
                const added = () => libraryIds().has(anime.id);
                return (
                  <Card class="overflow-hidden flex flex-col transition-colors hover:border-primary/50 group">
                    <div class="relative aspect-[2/3] w-full bg-muted overflow-hidden">
                      <Show
                        when={anime.cover_image}
                        fallback={
                          <div class="absolute inset-0 flex items-center justify-center">
                            <IconDeviceTv class="h-12 w-12 text-muted-foreground/30" />
                          </div>
                        }
                      >
                        <img
                          src={anime.cover_image}
                          alt={anime.title.romaji}
                          class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          loading="lazy"
                        />
                      </Show>
                      <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                        <Button
                          size="sm"
                          variant={added() ? "secondary" : "default"}
                          class="w-full gap-2"
                          disabled={added()}
                          onClick={() => setSelectedAnime(anime)}
                        >
                          <Show
                            when={added()}
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
                    <CardContent class="p-4 flex-1">
                      <h3
                        class="font-medium leading-tight line-clamp-2 mb-1"
                        title={anime.title.romaji}
                      >
                        {animeDisplayTitle(anime)}
                      </h3>
                      <Show when={animeAltTitles(anime).slice(1).join(" • ")}>
                        <p
                          class="text-xs text-muted-foreground line-clamp-1 mb-2"
                          title={animeAltTitles(anime).slice(1).join(" • ")}
                        >
                          {animeAltTitles(anime).slice(1).join(" • ")}
                        </p>
                      </Show>
                      <div class="flex flex-wrap gap-1.5 mt-auto">
                        <Show when={searchDegraded()}>
                          <Badge
                            variant="outline"
                            class="text-xs h-5 px-1.5 font-normal border-warning/20 bg-warning/5 text-warning"
                          >
                            Local only
                          </Badge>
                        </Show>
                        <Show when={formatMatchConfidence(anime.match_confidence)}>
                          <Badge
                            variant="outline"
                            class="text-xs h-5 px-1.5 font-normal border-info/30 text-info"
                          >
                            {formatMatchConfidence(anime.match_confidence)}
                          </Badge>
                        </Show>
                        <Show when={anime.format}>
                          <Badge variant="outline" class="text-xs h-5 px-1.5 font-normal">
                            {anime.format}
                          </Badge>
                        </Show>
                        <Show when={anime.episode_count}>
                          <Badge variant="outline" class="text-xs h-5 px-1.5 font-normal">
                            {anime.episode_count} eps
                          </Badge>
                        </Show>
                        <Show when={anime.status}>
                          <Badge
                            variant="outline"
                            class={cn(
                              "text-xs h-5 px-1.5 font-normal capitalize",
                              anime.status?.toLowerCase() === "releasing"
                                ? "text-success border-success/30"
                                : "text-muted-foreground",
                            )}
                          >
                            {anime.status?.replace("_", " ").toLowerCase()}
                          </Badge>
                        </Show>
                        <Show when={animeSearchSubtitle(anime)}>
                          {(startLabel) => (
                            <Badge variant="outline" class="text-xs h-5 px-1.5 font-normal">
                              <IconCalendarEvent class="mr-1 h-3 w-3" />
                              {startLabel()}
                            </Badge>
                          )}
                        </Show>
                        <Show when={anime.genres?.length}>
                          <Badge variant="outline" class="text-xs h-5 px-1.5 font-normal">
                            {anime.genres?.slice(0, 2).join(" / ")}
                          </Badge>
                        </Show>
                      </div>
                      <Show when={anime.description}>
                        <p class="mt-2 text-xs text-muted-foreground line-clamp-3">
                          {anime.description}
                        </p>
                      </Show>
                      <Show when={anime.synonyms?.length}>
                        <p class="mt-2 text-[11px] text-muted-foreground line-clamp-2">
                          Also known as {anime.synonyms?.slice(0, 3).join(" • ")}
                        </p>
                      </Show>
                      <Show when={anime.related_anime?.length}>
                        <div class="mt-2 space-y-2">
                          <For each={anime.related_anime?.slice(0, 2)}>
                            {(related) => (
                              <AnimeDiscoveryRow entry={related} libraryIds={libraryIds()} />
                            )}
                          </For>
                        </div>
                      </Show>
                      <Show when={anime.recommended_anime?.length}>
                        <div class="mt-2 space-y-2">
                          <For each={anime.recommended_anime?.slice(0, 2)}>
                            {(recommended) => (
                              <AnimeDiscoveryRow entry={recommended} libraryIds={libraryIds()} />
                            )}
                          </For>
                        </div>
                      </Show>
                      <Show when={anime.match_reason}>
                        <p class="mt-2 text-[11px] text-muted-foreground line-clamp-2">
                          {anime.match_reason}
                        </p>
                      </Show>
                    </CardContent>
                  </Card>
                );
              }}
            </For>

            <Show when={!searchQuery.isFetching && searchResults.length === 0}>
              <div class="col-span-full flex flex-col items-center justify-center py-12 text-muted-foreground">
                <IconAlertTriangle class="h-10 w-10 mb-3 opacity-50" />
                <p>No results found for "{debouncedQuery()}"</p>
              </div>
            </Show>
          </Show>
        </div>
      </div>

      <Show when={selectedAnime()}>
        <Suspense
          fallback={
            <div class="flex items-center justify-center p-8">
              <IconLoader2 class="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          }
        >
          <AddAnimeDialog
            anime={selectedAnime()!}
            open={!!selectedAnime()}
            onOpenChange={(open) => !open && setSelectedAnime(null)}
            onSuccess={() => {
              setSelectedAnime(null);
            }}
          />
        </Suspense>
      </Show>
    </div>
  );
}
