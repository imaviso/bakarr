import { RiSearchLine, RiTvLine } from "@remixicon/react";
import { createFileRoute } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { Suspense, lazy, useRef } from "react";
import { GeneralError } from "@/components/shared/general-error";
import { PageHeader } from "@/app/layout/page-header";
import { PageShell } from "@/app/layout/page-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MediaSearchResult } from "@/api/contracts";
import {
  mediaByAnilistIdQueryOptions,
  mediaListQueryOptions,
  useMediaListQuery,
  useMediaSearchQuery,
} from "@/api/media";
import { usePageTitle } from "@/app/page-title";
import { DEFAULT_SEASON_WINDOW, parseAddMediaSearch, type AddMediaSearch } from "./-add-search";
import { mediaKindLabel } from "@/domain/media-unit";
import { shiftSeasonWindow } from "@/domain/seasonal-navigation";
import { SelectedAnimeDialog } from "@/features/media/selected-anime-dialog";
import { SearchResults } from "@/features/media/add-search-results";

const SEARCH_DEBOUNCE_MS = 250;

const mediaKindItems = [
  { label: "Anime", value: "anime" as const },
  { label: "Manga", value: "manga" as const },
  { label: "Light novel", value: "light_novel" as const },
];

const SeasonalAnimeSectionLazy = lazy(() =>
  import("@/features/media/seasonal-media-section").then((module) => ({
    default: module.SeasonalAnimeSection,
  })),
);

export const Route = createFileRoute("/_layout/media/add")({
  validateSearch: parseAddMediaSearch,
  loader: ({ context: { queryClient }, location }) => {
    const search = parseAddMediaSearch(location.search);

    void queryClient.prefetchQuery(mediaListQueryOptions());

    if (search.id) {
      void queryClient.prefetchQuery(
        mediaByAnilistIdQueryOptions(search.id, search.media_kind ?? "anime"),
      );
    }
  },
  component: AddAnimePage,
  errorComponent: GeneralError,
});

function AddAnimePage() {
  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  usePageTitle("Add Media");
  const search = Route.useSearch();

  const anilistId = search.id ?? null;

  const query = search.q ?? "";
  const [debouncedQuery] = useDebouncedValue(query, { wait: SEARCH_DEBOUNCE_MS });
  const mediaKind = search.media_kind ?? "anime";
  const mediaLabel = mediaKindLabel(mediaKind);
  const activeTab = mediaKind === "anime" ? (search.tab ?? "search") : "search";
  const selectedSeason = search.season ?? DEFAULT_SEASON_WINDOW.season;
  const selectedYear = search.year ?? DEFAULT_SEASON_WINDOW.year;

  const searchQuery = useMediaSearchQuery(debouncedQuery, mediaKind);
  const searchResults = searchQuery.data?.results ?? [];
  const canSearch = debouncedQuery.trim().length >= 3;
  const searchDegraded = searchQuery.data?.degraded ?? false;
  const { data: animeList = [] } = useMediaListQuery();
  const libraryIds = new Set(animeList.map((media) => media.id));

  const updateSearch = (patch: Partial<AddMediaSearch>) => {
    const mergedSearch = { ...search, ...patch };
    void navigate({
      to: ".",
      search: {
        media_kind: mergedSearch.media_kind ?? "anime",
        q: mergedSearch.q ?? "",
        tab: mergedSearch.tab ?? "search",
        season: mergedSearch.season ?? DEFAULT_SEASON_WINDOW.season,
        year: String(mergedSearch.year ?? DEFAULT_SEASON_WINDOW.year),
        ...(mergedSearch.id === undefined ? {} : { id: String(mergedSearch.id) }),
      },
      replace: true,
    });
  };

  const clearSelectedAnime = () => {
    updateSearch({ id: undefined });
  };

  const handleSelectAnime = (anime: MediaSearchResult) => {
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
    <PageShell scroll="inner">
      <PageHeader
        title="Add Media"
        subtitle="Search anime, manga, or light novels to add to your library"
      >
        <div className="relative w-full sm:max-w-sm">
          <RiSearchLine className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            value={query}
            onChange={(event) => updateSearch({ q: event.currentTarget.value })}
            placeholder="Search by title..."
            aria-label={`Search for ${mediaLabel} by title`}
            className="pl-9 h-9"
          />
        </div>
        <Select
          selectedKey={mediaKind}
          onSelectionChange={(value) =>
            updateSearch({
              id: undefined,
              media_kind:
                value === "manga" || value === "light_novel" || value === "anime" ? value : "anime",
            })
          }
        >
          <SelectTrigger className="h-9 w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {mediaKindItems.map((item) => (
                <SelectItem key={item.value} id={item.value} textValue={item.label}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </PageHeader>

      <Tabs
        selectedKey={activeTab}
        onSelectionChange={(key) => handleTabChange(String(key))}
        className="flex flex-1 min-h-0 flex-col"
      >
        <TabsList className="w-full justify-start">
          <TabsTrigger id="search" className="gap-1.5">
            <RiSearchLine className="h-4 w-4" />
            Search
          </TabsTrigger>
          <TabsTrigger id="seasonal" isDisabled={mediaKind !== "anime"}>
            <RiTvLine className="h-4 w-4" />
            Seasonal
          </TabsTrigger>
        </TabsList>

        <TabsContent id="search" className="mt-6 flex flex-1 min-h-0 flex-col">
          <SearchResults
            active={activeTab === "search"}
            canSearch={canSearch}
            searchQuery={searchQuery}
            searchResults={searchResults}
            searchDegraded={searchDegraded}
            debouncedQuery={debouncedQuery}
            libraryIds={libraryIds}
            mediaLabel={mediaLabel}
            onSelectAnime={handleSelectAnime}
          />
        </TabsContent>
        <TabsContent id="seasonal" className="mt-6 flex flex-1 min-h-0 flex-col">
          {activeTab === "seasonal" && (
            <Suspense fallback={null}>
              <SeasonalAnimeSectionLazy
                active
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
          )}
        </TabsContent>
      </Tabs>

      {anilistId !== null && (
        <Suspense fallback={null}>
          <SelectedAnimeDialog
            anilistId={anilistId}
            mediaKind={mediaKind}
            onOpenChange={clearSelectedAnime}
            onSuccess={clearSelectedAnime}
          />
        </Suspense>
      )}
    </PageShell>
  );
}
