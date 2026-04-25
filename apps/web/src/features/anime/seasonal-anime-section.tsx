import { CaretLeftIcon, CaretRightIcon, InfoIcon } from "@phosphor-icons/react";
import { useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AnimeSearchResultCard } from "~/features/anime/anime-search-result-card";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { useContainerWidth } from "~/hooks/use-container-width";
import type { AnimeSearchResult } from "~/api/contracts";
import { seasonalAnimeInfiniteQueryOptions } from "~/api/anime";
import { formatSeasonWindowLabel } from "~/domain/seasonal-navigation";
import type { SeasonWindow } from "~/domain/seasonal-navigation";

interface SeasonalAnimeSectionProps {
  active: boolean;
  seasonWindow: SeasonWindow;
  onPrevious: () => void;
  onNext: () => void;
  libraryIds: ReadonlySet<number>;
  onSelectAnime: (anime: AnimeSearchResult) => void;
}

function getColCount(w: number) {
  if (w >= 1280) return 6;
  if (w >= 1024) return 5;
  if (w >= 640) return 4;
  if (w >= 480) return 3;
  return 2;
}

export function SeasonalAnimeSection(props: SeasonalAnimeSectionProps) {
  const [containerRef, width, nodeRef] = useContainerWidth();
  const colCount = getColCount(width);
  const containerW = Math.max(280, width);
  const colW = (containerW - (colCount - 1) * 16) / colCount;
  const estimateRowSize = Math.round(colW * 1.5 + 52 + 16);

  const { data, hasNextPage, fetchNextPage, isFetchingNextPage } = useSuspenseInfiniteQuery(
    seasonalAnimeInfiniteQueryOptions({
      season: props.seasonWindow.season,
      year: props.seasonWindow.year,
    }),
  );

  const allResults = data.pages.flatMap((page) => page.results);
  const isDegraded = data.pages.some((page) => page.degraded);

  const rowCount = Math.ceil(allResults.length / colCount);

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
  }, [props.seasonWindow.season, props.seasonWindow.year, rowVirtualizer, nodeRef]);

  const virtualRows = rowVirtualizer.getVirtualItems();

  const rowItems = (rowIndex: number) => {
    const cols = colCount;
    const startIdx = rowIndex * cols;
    return allResults.slice(startIdx, startIdx + cols);
  };

  const lastRequestedLength = useRef(-1);

  useEffect(() => {
    if (!hasNextPage) {
      lastRequestedLength.current = -1;
      return;
    }
    const virtualItems = virtualRows;
    if (virtualItems.length === 0) return;
    const lastItem = virtualItems[virtualItems.length - 1];
    if (!lastItem) return;

    if (
      lastItem.index >= rowCount - 2 &&
      lastRequestedLength.current !== allResults.length &&
      !isFetchingNextPage
    ) {
      lastRequestedLength.current = allResults.length;
      void fetchNextPage();
    }
  }, [hasNextPage, virtualRows, rowCount, allResults.length, isFetchingNextPage, fetchNextPage]);

  return (
    <section className="flex flex-col flex-1 min-h-0 overflow-hidden gap-4">
      <div className="flex flex-col gap-3 rounded-none border border-border bg-muted p-3 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Seasonal Anime</h2>
          <p className="text-xs text-muted-foreground">
            Trending for this season, paged by popularity.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={props.onPrevious}
            aria-label="Previous season"
          >
            <CaretLeftIcon className="h-4 w-4" />
          </Button>
          <span className="min-w-[132px] select-none text-center text-sm font-medium text-foreground">
            {formatSeasonWindowLabel(props.seasonWindow)}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={props.onNext}
            aria-label="Next season"
          >
            <CaretRightIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isDegraded && (
        <Alert className="rounded-none text-xs">
          <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <AlertDescription>
            AniList is temporarily unavailable or rate-limited. Showing Jikan fallback titles mapped
            to AniList IDs.
          </AlertDescription>
        </Alert>
      )}

      {allResults.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto py-10 text-muted-foreground border-2 border-dashed rounded-none bg-muted">
          <p className="text-sm">No seasonal anime found for this period.</p>
        </div>
      )}

      {allResults.length > 0 && (
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
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {rowItems(vRow.index).map((anime) => (
                    <AnimeSearchResultCard
                      key={anime.id}
                      anime={anime}
                      added={props.libraryIds.has(anime.id)}
                      onSelect={props.onSelectAnime}
                      compact
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
