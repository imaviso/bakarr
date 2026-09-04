import { RiArrowLeftSLine, RiArrowRightSLine, RiInformationLine } from "@remixicon/react";
import { useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { MediaSearchResultCard } from "@/features/media/media-search-result-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useContainerWidth } from "@/hooks/use-container-width";
import { useInfiniteNearEnd } from "@/hooks/use-infinite-near-end";
import type { MediaSearchResult } from "@/api/contracts";
import { seasonalMediaInfiniteQueryOptions } from "@/api/media";
import { formatSeasonWindowLabel } from "@/domain/seasonal-navigation";
import type { SeasonWindow } from "@/domain/seasonal-navigation";

interface SeasonalAnimeSectionProps {
  seasonWindow: SeasonWindow;
  onPrevious: () => void;
  onNext: () => void;
  libraryIds: ReadonlySet<number>;
  onSelectAnime: (anime: MediaSearchResult) => void;
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
    seasonalMediaInfiniteQueryOptions({
      season: props.seasonWindow.season,
      year: props.seasonWindow.year,
    }),
  );

  const allResults = data.pages.flatMap((page) => page.results);
  const isDegraded = data.pages.some((page) => page.degraded);

  const rowCount = Math.ceil(allResults.length / colCount);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    estimateSize: () => estimateRowSize,
    overscan: 4,
    getScrollElement: () => nodeRef.current,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();

  const rowItems = (rowIndex: number) => {
    const cols = colCount;
    const startIdx = rowIndex * cols;
    return allResults.slice(startIdx, startIdx + cols);
  };

  useInfiniteNearEnd({
    hasNextPage,
    isFetchingNextPage,
    total: allResults.length,
    threshold: 2,
    lastIndex: virtualRows.at(-1)?.index ?? -1,
    fetchNextPage: () => void fetchNextPage(),
  });

  return (
    <section className="flex flex-col flex-1 min-h-0 overflow-hidden gap-4">
      <div className="flex flex-col gap-3 rounded-none border border-border bg-muted p-3 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <div>
          <h2 className="text-lg font-medium tracking-tight text-foreground">Seasonal Media</h2>
          <p className="text-xs text-muted-foreground">
            Trending for this season, paged by popularity.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onPress={props.onPrevious}
            aria-label="Previous season"
          >
            <RiArrowLeftSLine className="h-4 w-4" />
          </Button>
          <span className="min-w-[132px] select-none text-center text-sm font-medium text-foreground">
            {formatSeasonWindowLabel(props.seasonWindow)}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onPress={props.onNext}
            aria-label="Next season"
          >
            <RiArrowRightSLine className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isDegraded && (
        <Alert className="rounded-none text-xs">
          <RiInformationLine className="mt-0.5 h-4 w-4 shrink-0" />
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
                  {rowItems(vRow.index).map((media) => (
                    <MediaSearchResultCard
                      key={media.id}
                      media={media}
                      added={props.libraryIds.has(media.id)}
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
