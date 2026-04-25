import { WarningIcon, TelevisionIcon, InfoIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, lazy, useCallback, useEffect, useRef, useTransition } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useContainerWidth } from "~/hooks/use-container-width";
import { Schema } from "effect";
import { GeneralError } from "~/components/shared/general-error";
import { PageHeader } from "~/app/layout/page-header";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Skeleton } from "~/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Input } from "~/components/ui/input";
import type { AnimeSearchResult } from "~/api/contracts";
import {
  animeByAnilistIdQueryOptions,
  animeListQueryOptions,
  createAnimeSearchQuery,
  seasonalAnimeInfiniteQueryOptions,
} from "~/api/anime";
import { profilesQueryOptions, releaseProfilesQueryOptions } from "~/api/profiles";
import { systemConfigQueryOptions } from "~/api/system-config";
import { usePageTitle } from "~/domain/page-title";
import { getCurrentSeasonWindow, shiftSeasonWindow } from "~/domain/seasonal-navigation";

const DEFAULT_SEASON_WINDOW = getCurrentSeasonWindow();

const AnimeSearchResultCardLazy = lazy(() =>
  import("~/features/anime/anime-search-result-card").then((module) => ({
    default: module.AnimeSearchResultCard,
  })),
);
const SeasonalAnimeSectionLazy = lazy(() =>
  import("~/features/anime/seasonal-anime-section").then((module) => ({
    default: module.SeasonalAnimeSection,
  })),
);
const AddAnimeDialogLazy = lazy(() =>
  import("~/features/anime/add-anime-dialog").then((module) => ({
    default: module.AddAnimeDialog,
  })),
);

const TabSchema = Schema.transform(Schema.String, Schema.Literal("search", "seasonal"), {
  decode: (s) => (s === "seasonal" ? "seasonal" : "search"),
  encode: (s) => s,
});

const SeasonSchema = Schema.transform(
  Schema.String,
  Schema.Literal("winter", "spring", "summer", "fall"),
  {
    decode: (s) => {
      if (s === "winter" || s === "spring" || s === "summer" || s === "fall") return s;
      return DEFAULT_SEASON_WINDOW.season;
    },
    encode: (s) => s,
  },
);

const YearSchema = Schema.transform(Schema.Union(Schema.String, Schema.Number), Schema.Number, {
  decode: (value) => {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isInteger(n) ? n : DEFAULT_SEASON_WINDOW.year;
  },
  encode: (n) => n,
});

const searchSchema = Schema.Struct({
  id: Schema.optional(Schema.NumberFromString.pipe(Schema.int())),
  q: Schema.optional(Schema.String),
  tab: Schema.optional(TabSchema),
  season: Schema.optional(SeasonSchema),
  year: Schema.optional(YearSchema),
});

type AddAnimeSearch = Schema.Schema.Type<typeof searchSchema>;

export const Route = createFileRoute("/_layout/anime/add")({
  validateSearch: Schema.standardSchemaV1(searchSchema),
  loader: async ({ context: { queryClient }, location }) => {
    const search = Schema.decodeUnknownSync(searchSchema)(location.search);
    await Promise.all([
      queryClient.ensureQueryData(animeListQueryOptions()),
      queryClient.ensureQueryData(profilesQueryOptions()),
      queryClient.ensureQueryData(releaseProfilesQueryOptions()),
      queryClient.ensureQueryData(systemConfigQueryOptions()),
    ]);
    await queryClient.prefetchInfiniteQuery(
      seasonalAnimeInfiniteQueryOptions({
        season: search.season ?? DEFAULT_SEASON_WINDOW.season,
        year: search.year ?? DEFAULT_SEASON_WINDOW.year,
      }),
    );
    if (search.id) {
      await queryClient.ensureQueryData(animeByAnilistIdQueryOptions(search.id));
    }
  },
  component: AddAnimePage,
  errorComponent: GeneralError,
});

function AddAnimePage() {
  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  usePageTitle("Add Anime");
  const search = Route.useSearch();
  const [, startTransition] = useTransition();

  const anilistId = search.id ?? null;

  const query = search.q ?? "";
  const activeTab = search.tab ?? "search";
  const selectedSeason = search.season ?? DEFAULT_SEASON_WINDOW.season;
  const selectedYear = search.year ?? DEFAULT_SEASON_WINDOW.year;

  const searchQuery = createAnimeSearchQuery(query);
  const searchResults = searchQuery.data?.results ?? [];
  const canSearch = query.trim().length >= 3;
  const searchDegraded = searchQuery.data?.degraded ?? false;
  const { data: animeList } = useSuspenseQuery(animeListQueryOptions());
  const libraryIds = new Set(animeList.map((anime) => anime.id));

  const updateSearch = (patch: Partial<AddAnimeSearch>) => {
    const mergedSearch = { ...search, ...patch };
    startTransition(() => {
      void navigate({
        to: ".",
        search: {
          q: mergedSearch.q ?? "",
          tab: mergedSearch.tab ?? "search",
          season: mergedSearch.season ?? DEFAULT_SEASON_WINDOW.season,
          year: String(mergedSearch.year ?? DEFAULT_SEASON_WINDOW.year),
          ...(mergedSearch.id === undefined ? {} : { id: String(mergedSearch.id) }),
        },
        replace: true,
      });
    });
  };

  const clearSelectedAnime = () => {
    updateSearch({ id: undefined });
  };

  const handleSelectAnime = (anime: AnimeSearchResult) => {
    updateSearch({ id: anime.id });
  };

  const handleTabChange = (value: string) => {
    const nextTab = value === "seasonal" ? "seasonal" : "search";
    updateSearch({ tab: nextTab });
    if (nextTab === "search") {
      searchInputRef.current?.focus();
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden gap-2">
      <PageHeader
        title="Add Anime"
        subtitle="Search or browse seasonal anime to add to your library"
      >
        <div className="relative w-full sm:max-w-sm">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            value={query}
            onChange={(event) => updateSearch({ q: event.currentTarget.value })}
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
          <SearchResults
            active={activeTab === "search"}
            canSearch={canSearch}
            searchQuery={searchQuery}
            searchResults={searchResults}
            searchDegraded={searchDegraded}
            debouncedQuery={query}
            libraryIds={libraryIds}
            onSelectAnime={handleSelectAnime}
          />
        </TabsContent>
        <TabsContent value="seasonal" className="mt-6 flex flex-1 min-h-0 flex-col">
          <Suspense fallback={null}>
            <SeasonalAnimeSectionLazy
              active={activeTab === "seasonal"}
              seasonWindow={{ season: selectedSeason, year: selectedYear }}
              onPrevious={() => {
                const previous = shiftSeasonWindow(
                  { season: selectedSeason, year: selectedYear },
                  -1,
                );
                updateSearch({ season: previous.season, year: previous.year });
              }}
              onNext={() => {
                const next = shiftSeasonWindow({ season: selectedSeason, year: selectedYear }, 1);
                updateSearch({ season: next.season, year: next.year });
              }}
              libraryIds={libraryIds}
              onSelectAnime={handleSelectAnime}
            />
          </Suspense>
        </TabsContent>
      </Tabs>

      {anilistId !== null && (
        <Suspense fallback={null}>
          <SelectedAnimeDialog
            anilistId={anilistId}
            onOpenChange={clearSelectedAnime}
            onSuccess={clearSelectedAnime}
          />
        </Suspense>
      )}
    </div>
  );
}

function SelectedAnimeDialog({
  anilistId,
  onOpenChange,
  onSuccess,
}: {
  anilistId: number;
  onOpenChange: () => void;
  onSuccess: () => void;
}) {
  const { data: anime } = useSuspenseQuery(animeByAnilistIdQueryOptions(anilistId));
  return (
    <AddAnimeDialogLazy
      anime={anime}
      open
      onOpenChange={(open) => {
        if (!open) {
          onOpenChange();
        }
      }}
      onSuccess={onSuccess}
    />
  );
}

const SCREEN_SM = 640;
const SCREEN_MD = 1024;
const SCREEN_LG = 1280;
const SCREEN_XL = 1536;

function getSearchColCount(w: number) {
  if (w >= SCREEN_XL) return 5;
  if (w >= SCREEN_LG) return 4;
  if (w >= SCREEN_MD) return 3;
  if (w >= SCREEN_SM) return 2;
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

  const getScrollElement = useCallback(() => nodeRef.current, [nodeRef]);

  const estimateSize = useCallback(() => estimateRowSize, [estimateRowSize]);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    estimateSize,
    overscan: 4,
    getScrollElement,
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
        <Alert className="rounded-none text-xs">
          <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <AlertDescription>
            AniList is temporarily unavailable or rate-limited. Showing local library matches only.
          </AlertDescription>
        </Alert>
      )}

      {!props.canSearch && (
        <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto py-20 text-muted-foreground border-2 border-dashed rounded-none bg-muted">
          <MagnifyingGlassIcon className="h-12 w-12 mb-4 opacity-50" />
          <h2 className="font-medium text-lg">Search for your next anime</h2>
          <p className="text-sm mt-1">Type at least 3 characters in the search bar above</p>
        </div>
      )}

      {props.canSearch && !!props.searchQuery.error && (
        <div className="flex-1 overflow-y-auto p-8 text-center text-destructive bg-destructive/10 rounded-none">
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
          <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
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
          className="h-full min-h-0 w-full flex-1 overflow-y-auto overflow-x-hidden"
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
          <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto py-12 text-muted-foreground">
            <WarningIcon className="h-10 w-10 mb-3 opacity-50" />
            <p>No results found for &quot;{props.debouncedQuery}&quot;</p>
          </div>
        )}
    </div>
  );
}
