import {
  IconAlertTriangle,
  IconDeviceTv,
  IconInfoCircle,
  IconLoader2,
  IconSearch,
} from "@tabler/icons-solidjs";
import { createFileRoute } from "@tanstack/solid-router";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  on,
  onCleanup,
  onMount,
  Show,
  Switch,
  Suspense,
} from "solid-js";
import { createVirtualizer } from "@tanstack/solid-virtual";
import * as v from "valibot";
import { AnimeSearchResultCard } from "~/components/anime/anime-search-result-card";
import { SeasonalAnimeSection } from "~/components/anime/seasonal-anime-section";
import { AddAnimeDialog } from "~/components/add-anime-dialog";
import { GeneralError } from "~/components/general-error";
import { PageHeader } from "~/components/page-header";
import { Skeleton } from "~/components/ui/skeleton";
import { Tabs, TabsContent, TabsIndicator, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { TextField, TextFieldInput } from "~/components/ui/text-field";
import {
  type AnimeSearchResult,
  createAnimeByAnilistIdQuery,
  createAnimeListQuery,
  createAnimeSearchQuery,
  createSeasonalAnimeInfiniteQuery,
  profilesQueryOptions,
  releaseProfilesQueryOptions,
  systemConfigQueryOptions,
} from "~/lib/api";
import { createDebouncer } from "~/lib/debounce";
import { usePageTitle } from "~/lib/page-title";
import { getCurrentSeasonWindow, shiftSeasonWindow } from "~/lib/seasonal-navigation";

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
  // eslint-disable-next-line no-unassigned-vars -- SolidJS ref assigned by component mount
  let searchInputRef: HTMLInputElement | undefined;
  usePageTitle(() => "Add Anime");
  const search = Route.useSearch();
  const [query, setQuery] = createSignal("");
  const [debouncedQuery, setDebouncedQuery] = createSignal("");
  const debouncer = createDebouncer(setDebouncedQuery, 500);
  const [selectedAnime, setSelectedAnime] = createSignal<AnimeSearchResult | null>(null);
  const [autoSelectedAnilistId, setAutoSelectedAnilistId] = createSignal<number | null>(null);
  const [seasonWindow, setSeasonWindow] = createSignal(getCurrentSeasonWindow());

  const anilistId = () => {
    const searchParams = search();
    return searchParams.id ?? null;
  };

  const anilistIdQuery = createAnimeByAnilistIdQuery(anilistId);

  createEffect(() => {
    const currentAnilistId = anilistId();
    const currentSelected = selectedAnime();

    if (currentAnilistId !== null && currentSelected && currentSelected.id !== currentAnilistId) {
      setSelectedAnime(null);
      return;
    }

    if (currentAnilistId === null) {
      if (autoSelectedAnilistId() !== null) {
        setAutoSelectedAnilistId(null);
      }
      return;
    }

    if (autoSelectedAnilistId() === currentAnilistId) {
      return;
    }

    const fetchedAnime = anilistIdQuery.data;
    if (!fetchedAnime || fetchedAnime.id !== currentAnilistId || selectedAnime()) {
      return;
    }

    setSelectedAnime(fetchedAnime);
    setAutoSelectedAnilistId(currentAnilistId);
  });

  createEffect(() => {
    debouncer.schedule(query());
    onCleanup(() => debouncer.cancel());
  });

  const searchQuery = createAnimeSearchQuery(debouncedQuery);
  const searchResults = createMemo(() => searchQuery.data?.results ?? []);
  const canSearch = createMemo(() => debouncedQuery().trim().length >= 3);
  const searchDegraded = createMemo(() => searchQuery.data?.degraded ?? false);
  const animeListQuery = createAnimeListQuery();
  const libraryIds = createMemo(
    () => new Set((animeListQuery.data ?? []).map((anime) => anime.id)),
  );

  const seasonalQuery = createSeasonalAnimeInfiniteQuery(() => ({
    season: seasonWindow().season,
    year: seasonWindow().year,
  }));

  const [activeTab, setActiveTab] = createSignal<string>("search");

  onMount(() => {
    searchInputRef?.focus();
  });

  createEffect(() => {
    if (activeTab() !== "search") {
      return;
    }

    searchInputRef?.focus();
  });

  return (
    <div class="flex flex-col flex-1 min-h-0 space-y-6">
      <PageHeader
        title="Add Anime"
        subtitle="Search or browse seasonal anime to add to your library"
      >
        <div class="relative w-full sm:max-w-sm">
          <IconSearch class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <TextField class="w-full" value={query()} onChange={setQuery}>
            <TextFieldInput
              ref={searchInputRef}
              placeholder="Search by title..."
              aria-label="Search for anime by title"
              class="pl-9 h-9"
            />
          </TextField>
        </div>
      </PageHeader>

      <Tabs value={activeTab()} onChange={setActiveTab} class="flex flex-1 min-h-0 flex-col">
        <TabsList class="w-full justify-start">
          <TabsTrigger value="search" class="gap-1.5">
            <IconSearch class="h-4 w-4" />
            Search
          </TabsTrigger>
          <TabsTrigger value="seasonal">
            <IconDeviceTv class="h-4 w-4" />
            Seasonal
          </TabsTrigger>
          <TabsIndicator />
        </TabsList>

        <Switch>
          <Match when={activeTab() === "search"}>
            <TabsContent value="search" class="mt-6 flex flex-1 min-h-0 flex-col">
              <SearchResults
                active
                canSearch={canSearch()}
                searchQuery={searchQuery}
                searchResults={searchResults()}
                searchDegraded={searchDegraded()}
                debouncedQuery={debouncedQuery()}
                libraryIds={libraryIds()}
                onSelectAnime={setSelectedAnime}
              />
            </TabsContent>
          </Match>
          <Match when={activeTab() === "seasonal"}>
            <TabsContent value="seasonal" class="mt-6 flex flex-1 min-h-0 flex-col">
              <SeasonalAnimeSection
                active
                seasonWindow={seasonWindow()}
                onPrevious={() => setSeasonWindow((prev) => shiftSeasonWindow(prev, -1))}
                onNext={() => setSeasonWindow((prev) => shiftSeasonWindow(prev, 1))}
                query={seasonalQuery}
                libraryIds={libraryIds()}
                onSelectAnime={setSelectedAnime}
              />
            </TabsContent>
          </Match>
        </Switch>
      </Tabs>

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

function getSearchColCount(w: number) {
  if (w >= 1536) return 5;
  if (w >= 1280) return 4;
  if (w >= 1024) return 3;
  if (w >= 640) return 2;
  return 1;
}

interface SearchResultsProps {
  active: boolean;
  canSearch: boolean;
  searchQuery: ReturnType<typeof createAnimeSearchQuery>;
  searchResults: AnimeSearchResult[];
  searchDegraded: boolean;
  debouncedQuery: string;
  libraryIds: ReadonlySet<number>;
  onSelectAnime: (anime: AnimeSearchResult) => void;
}

function SearchResults(props: SearchResultsProps) {
  let scrollRef: HTMLDivElement | undefined;
  const [viewportWidth, setViewportWidth] = createSignal(
    typeof window === "undefined" ? 1280 : window.innerWidth,
  );
  const colCount = createMemo(() => getSearchColCount(viewportWidth()));

  onMount(() => {
    let rafId: number;
    const handler = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => setViewportWidth(window.innerWidth));
    };
    handler();
    window.addEventListener("resize", handler);
    onCleanup(() => {
      window.removeEventListener("resize", handler);
      cancelAnimationFrame(rafId);
    });
  });

  const rowCount = createMemo(() => Math.ceil(props.searchResults.length / colCount()));

  const estimateRowSize = createMemo(() => {
    const cols = colCount();
    const vw = viewportWidth();
    const containerW = Math.max(280, vw - (vw >= 768 ? 260 : 0) - 48);
    const colW = (containerW - (cols - 1) * 16) / cols;
    return Math.round(colW * 1.5 + 68 + 16);
  });

  const rowVirtualizer = createVirtualizer({
    get count() {
      return rowCount();
    },
    estimateSize: () => estimateRowSize(),
    overscan: 4,
    getScrollElement: () => scrollRef ?? null,
  });

  createEffect(() => {
    if (!props.active) {
      return;
    }

    rowVirtualizer.measure();
  });

  createEffect(
    on(
      () => props.debouncedQuery,
      () => {
        if (scrollRef) {
          scrollRef.scrollTop = 0;
        }

        rowVirtualizer.scrollToOffset(0);
        rowVirtualizer.measure();
      },
    ),
  );

  const virtualRows = createMemo(() => rowVirtualizer.getVirtualItems());

  const rowItems = (rowIndex: number) => {
    const cols = colCount();
    const startIdx = rowIndex * cols;
    return props.searchResults.slice(startIdx, startIdx + cols);
  };

  return (
    <div class="space-y-4 flex flex-1 min-h-0 flex-col">
      <Show when={props.canSearch && props.searchDegraded}>
        <div class="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <IconInfoCircle class="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            AniList is temporarily unavailable or rate-limited. Showing local library matches only.
          </p>
        </div>
      </Show>

      <Show when={!props.canSearch}>
        <div class="flex flex-col items-center justify-center py-20 text-muted-foreground border-2 border-dashed rounded-lg bg-muted/10">
          <IconSearch class="h-12 w-12 mb-4 opacity-50" />
          <h2 class="font-medium text-lg">Search for your next anime</h2>
          <p class="text-sm mt-1">Type at least 3 characters in the search bar above</p>
        </div>
      </Show>

      <Show when={props.canSearch && !!props.searchQuery.error}>
        <div class="p-8 text-center text-destructive bg-destructive/10 rounded-lg">
          <p>Failed to search anime. Please try again.</p>
          <p class="text-sm mt-2 opacity-80">
            {props.searchQuery.error instanceof Error
              ? props.searchQuery.error.message
              : String(props.searchQuery.error)}
          </p>
        </div>
      </Show>

      <Show
        when={
          props.canSearch &&
          !props.searchQuery.error &&
          props.searchQuery.isFetching &&
          props.searchResults.length === 0
        }
      >
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
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
        </div>
      </Show>

      <Show when={props.canSearch && !props.searchQuery.error && props.searchResults.length > 0}>
        <div
          ref={(el) => {
            scrollRef = el;
          }}
          class="overflow-y-auto flex-1 min-h-0"
          style={{ "overflow-anchor": "none" }}
        >
          <div class="relative w-full" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
            <For each={virtualRows()} fallback={null}>
              {(vRow) => (
                <div
                  data-index={vRow.index}
                  ref={(el) => rowVirtualizer.measureElement(el)}
                  class="absolute left-0 top-0 w-full"
                  style={{ transform: `translateY(${vRow.start}px)` }}
                >
                  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                    <For each={rowItems(vRow.index)}>
                      {(anime) => (
                        <AnimeSearchResultCard
                          anime={anime}
                          added={props.libraryIds.has(anime.id)}
                          onSelect={props.onSelectAnime}
                          showSearchMeta
                          searchDegraded={props.searchDegraded}
                        />
                      )}
                    </For>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      <Show
        when={
          props.canSearch &&
          !props.searchQuery.error &&
          !props.searchQuery.isFetching &&
          props.searchResults.length === 0
        }
      >
        <div class="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <IconAlertTriangle class="h-10 w-10 mb-3 opacity-50" />
          <p>No results found for "{props.debouncedQuery}"</p>
        </div>
      </Show>
    </div>
  );
}
