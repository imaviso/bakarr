import {
  WarningIcon,
  TelevisionIcon,
  InfoIcon,
  SpinnerIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import {
  Suspense,
  lazy,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useContainerWidth } from "~/hooks/use-container-width";
import * as v from "valibot";
import { GeneralError } from "~/components/general-error";
import { PageHeader } from "~/components/page-header";
import { Skeleton } from "~/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Input } from "~/components/ui/input";
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
import { usePageTitle } from "~/lib/page-title";
import { getCurrentSeasonWindow, shiftSeasonWindow } from "~/lib/seasonal-navigation";

const AnimeSearchResultCardLazy = lazy(() =>
  import("~/components/anime/anime-search-result-card").then((module) => ({
    default: module.AnimeSearchResultCard,
  })),
);
const SeasonalAnimeSectionLazy = lazy(() =>
  import("~/components/anime/seasonal-anime-section").then((module) => ({
    default: module.SeasonalAnimeSection,
  })),
);
const AddAnimeDialogLazy = lazy(() =>
  import("~/components/add-anime-dialog").then((module) => ({
    default: module.AddAnimeDialog,
  })),
);

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
  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  usePageTitle("Add Anime");
  const search = Route.useSearch();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDeferredValue(query);
  const [selectedAnime, setSelectedAnime] = useState<AnimeSearchResult | null>(null);
  const [seasonWindow, setSeasonWindow] = useState(() => getCurrentSeasonWindow());

  const anilistId = search.id ?? null;

  const anilistIdQuery = createAnimeByAnilistIdQuery(anilistId);

  const searchQuery = createAnimeSearchQuery(debouncedQuery);
  const searchResults = searchQuery.data?.results ?? [];
  const canSearch = debouncedQuery.trim().length >= 3;
  const searchDegraded = searchQuery.data?.degraded ?? false;
  const animeListQuery = createAnimeListQuery();
  const libraryIds = useMemo(
    () => new Set((animeListQuery.data ?? []).map((anime) => anime.id)),
    [animeListQuery.data],
  );

  const seasonalQuery = createSeasonalAnimeInfiniteQuery({
    season: seasonWindow.season,
    year: seasonWindow.year,
  });

  const [activeTab, setActiveTab] = useState<string>("search");

  useLayoutEffect(() => {
    if (activeTab === "search") {
      searchInputRef.current?.focus();
    }
  }, [activeTab]);

  const selectedAnimeFromSearch =
    anilistId !== null && anilistIdQuery.data?.id === anilistId ? anilistIdQuery.data : null;
  const activeSelectedAnime = selectedAnimeFromSearch ?? selectedAnime;

  const clearSelectedAnime = () => {
    if (anilistId !== null) {
      void navigate({ to: "/anime/add", search: {} });
    }
    setSelectedAnime(null);
  };

  const handleSelectAnime = (anime: AnimeSearchResult) => {
    if (anilistId !== null) {
      void navigate({ to: "/anime/add", search: {} });
    }
    setSelectedAnime(anime);
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value === "search") {
      searchInputRef.current?.focus();
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden gap-6">
      <PageHeader
        title="Add Anime"
        subtitle="Search or browse seasonal anime to add to your library"
      >
        <div className="relative w-full sm:max-w-sm">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search by title..."
            aria-label="Search for anime by title"
            className="pl-9 h-9"
          />
        </div>
      </PageHeader>

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="flex flex-1 min-h-0 flex-col"
      >
        <TabsList className="w-full justify-start">
          <TabsTrigger value="search" className="gap-1.5">
            <MagnifyingGlassIcon className="h-4 w-4" />
            Search
          </TabsTrigger>
          <TabsTrigger value="seasonal">
            <TelevisionIcon className="h-4 w-4" />
            Seasonal
          </TabsTrigger>
        </TabsList>

        <TabsContent value="search" className="mt-6 flex flex-1 min-h-0 flex-col">
          <Suspense
            fallback={<div className="text-sm text-muted-foreground">Loading search...</div>}
          >
            <SearchResults
              active={activeTab === "search"}
              canSearch={canSearch}
              searchQuery={searchQuery}
              searchResults={searchResults}
              searchDegraded={searchDegraded}
              debouncedQuery={debouncedQuery}
              libraryIds={libraryIds}
              onSelectAnime={handleSelectAnime}
            />
          </Suspense>
        </TabsContent>
        <TabsContent value="seasonal" className="mt-6 flex flex-1 min-h-0 flex-col">
          <Suspense
            fallback={
              <div className="text-sm text-muted-foreground">Loading seasonal titles...</div>
            }
          >
            <SeasonalAnimeSectionLazy
              active={activeTab === "seasonal"}
              seasonWindow={seasonWindow}
              onPrevious={() => setSeasonWindow((prev) => shiftSeasonWindow(prev, -1))}
              onNext={() => setSeasonWindow((prev) => shiftSeasonWindow(prev, 1))}
              query={seasonalQuery}
              libraryIds={libraryIds}
              onSelectAnime={handleSelectAnime}
            />
          </Suspense>
        </TabsContent>
      </Tabs>

      {activeSelectedAnime && (
        <Suspense
          fallback={
            <div className="flex items-center justify-center p-8">
              <SpinnerIcon className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          }
        >
          <AddAnimeDialogLazy
            anime={activeSelectedAnime}
            open={!!activeSelectedAnime}
            onOpenChange={(open) => {
              if (!open) {
                clearSelectedAnime();
              }
            }}
            onSuccess={clearSelectedAnime}
          />
        </Suspense>
      )}
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
  const [containerRef, width, nodeRef] = useContainerWidth();
  const colCount = getSearchColCount(width);
  const containerW = Math.max(280, width);
  const colW = (containerW - (colCount - 1) * 16) / colCount;
  const estimateRowSize = Math.round(colW * 1.5 + 68 + 16);
  const rowCount = Math.ceil(props.searchResults.length / colCount);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    estimateSize: () => estimateRowSize,
    overscan: 4,
    getScrollElement: () => nodeRef.current,
  });

  useEffect(() => {
    if (!props.active) {
      return;
    }

    rowVirtualizer.measure();
  }, [props.active, rowVirtualizer]);

  useEffect(() => {
    const el = nodeRef.current;
    if (el) {
      el.scrollTop = 0;
    }

    rowVirtualizer.scrollToOffset(0);
    rowVirtualizer.measure();
  }, [props.debouncedQuery, rowVirtualizer, nodeRef]);

  const virtualRows = rowVirtualizer.getVirtualItems();

  const rowItems = (rowIndex: number) => {
    const cols = colCount;
    const startIdx = rowIndex * cols;
    return props.searchResults.slice(startIdx, startIdx + cols);
  };

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden flex-col gap-4">
      {props.canSearch && props.searchDegraded && (
        <div className="flex items-start gap-2 rounded-none border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
          <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            AniList is temporarily unavailable or rate-limited. Showing local library matches only.
          </p>
        </div>
      )}

      {!props.canSearch && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground border-2 border-dashed rounded-none bg-muted">
          <MagnifyingGlassIcon className="h-12 w-12 mb-4 opacity-50" />
          <h2 className="font-medium text-lg">Search for your next anime</h2>
          <p className="text-sm mt-1">Type at least 3 characters in the search bar above</p>
        </div>
      )}

      {props.canSearch && !!props.searchQuery.error && (
        <div className="p-8 text-center text-destructive bg-destructive/10 rounded-none">
          <p>Failed to search anime. Please try again.</p>
          <p className="text-sm mt-2 opacity-80">
            {props.searchQuery.error instanceof Error
              ? props.searchQuery.error.message
              : String(props.searchQuery.error)}
          </p>
        </div>
      )}

      {props.canSearch &&
        !props.searchQuery.error &&
        props.searchQuery.isFetching &&
        props.searchResults.length === 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((row) => (
              <div key={`skeleton-${row}`} className="space-y-3">
                <Skeleton className="aspect-[2/3] w-full rounded-none" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

      {props.canSearch && !props.searchQuery.error && props.searchResults.length > 0 && (
        <div
          ref={containerRef}
          className="h-full min-h-0 overflow-y-auto overflow-x-hidden"
          style={{ overflowAnchor: "none" }}
        >
          <div className="relative w-full" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
            {virtualRows.map((vRow) => (
              <div
                key={vRow.key}
                data-index={vRow.index}
                ref={rowVirtualizer.measureElement}
                className="absolute left-0 top-0 w-full"
                style={{ transform: `translateY(${vRow.start}px)` }}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                  {rowItems(vRow.index).map((anime) => (
                    <AnimeSearchResultCardLazy
                      key={anime.id}
                      anime={anime}
                      added={props.libraryIds.has(anime.id)}
                      onSelect={props.onSelectAnime}
                      showSearchMeta
                      searchDegraded={props.searchDegraded}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {props.canSearch &&
        !props.searchQuery.error &&
        !props.searchQuery.isFetching &&
        props.searchResults.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <WarningIcon className="h-10 w-10 mb-3 opacity-50" />
            <p>No results found for &quot;{props.debouncedQuery}&quot;</p>
          </div>
        )}
    </div>
  );
}
