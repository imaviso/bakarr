import { useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { RiErrorWarningLine, RiInformationLine, RiSearchLine } from "@remixicon/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useContainerWidth } from "@/hooks/use-container-width";
import { errorMessage } from "@/api/effect/errors";
import type { MediaSearchResult } from "@/api/contracts";
import type { useMediaSearchQuery } from "@/api/media";
import { MediaSearchResultCardLazy } from "./media-search-result-card-lazy";

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
  searchQuery: ReturnType<typeof useMediaSearchQuery>;
  searchResults: MediaSearchResult[];
  searchDegraded: boolean;
  debouncedQuery: string;
  libraryIds: ReadonlySet<number>;
  mediaLabel: string;
  onSelectAnime: (anime: MediaSearchResult) => void;
}

export function SearchResults(props: SearchResultsProps) {
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
    enabled: props.active,
  });

  useEffect(() => {
    const el = nodeRef.current;
    if (el) {
      el.scrollTop = 0;
    }

    rowVirtualizer.scrollToOffset(0);
    rowVirtualizer.measure();
  }, [props.debouncedQuery, rowVirtualizer, nodeRef, props.active]);

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
          <RiInformationLine className="mt-0.5 h-4 w-4 shrink-0" />
          <AlertDescription>
            AniList is temporarily unavailable or rate-limited. Showing local library matches only.
          </AlertDescription>
        </Alert>
      )}

      {!props.canSearch && (
        <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto py-20 text-muted-foreground border-2 border-dashed rounded-none bg-muted">
          <RiSearchLine className="h-12 w-12 mb-4 opacity-50" />
          <h2 className="font-medium text-lg">Search for your next {props.mediaLabel}</h2>
          <p className="text-sm mt-1">Type at least 3 characters in the search bar above</p>
        </div>
      )}

      {props.canSearch && !!props.searchQuery.error && (
        <div className="flex-1 overflow-y-auto p-8 text-center text-destructive bg-destructive/10 rounded-none">
          <p>Failed to search {props.mediaLabel}. Please try again.</p>
          <p className="text-sm mt-2 opacity-80">
            {errorMessage(props.searchQuery.error, "Search failed")}
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
                  {rowItems(vRow.index).map((media) => (
                    <MediaSearchResultCardLazy
                      key={media.id}
                      media={media}
                      added={props.libraryIds.has(media.id)}
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
            <RiErrorWarningLine className="h-10 w-10 mb-3 opacity-50" />
            <p>No results found for &quot;{props.debouncedQuery}&quot;</p>
          </div>
        )}
    </div>
  );
}
