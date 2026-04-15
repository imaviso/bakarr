import { IconChevronLeft, IconChevronRight, IconInfoCircle } from "@tabler/icons-solidjs";
import type { CreateInfiniteQueryResult, InfiniteData } from "@tanstack/solid-query";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { createVirtualizer } from "@tanstack/solid-virtual";
import { AnimeSearchResultCard } from "~/components/anime/anime-search-result-card";
import { Button } from "~/components/ui/button";
import type { AnimeSearchResult, SeasonalAnimeResponse } from "~/lib/api";
import { formatSeasonWindowLabel } from "~/lib/seasonal-navigation";
import type { SeasonWindow } from "~/lib/seasonal-navigation";

interface SeasonalAnimeSectionProps {
  active: boolean;
  seasonWindow: SeasonWindow;
  onPrevious: () => void;
  onNext: () => void;
  query: CreateInfiniteQueryResult<InfiniteData<SeasonalAnimeResponse>>;
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
  let scrollRef: HTMLDivElement | undefined;
  const [viewportWidth, setViewportWidth] = createSignal(
    typeof window === "undefined" ? 1280 : window.innerWidth,
  );
  const colCount = createMemo(() => getColCount(viewportWidth()));

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

  const allResults = createMemo(
    () => props.query.data?.pages.flatMap((page) => page.results) ?? [],
  );
  const isDegraded = createMemo(
    () => props.query.data?.pages.some((page) => page.degraded) ?? false,
  );

  const rowCount = createMemo(() => Math.ceil(allResults().length / colCount()));

  const estimateRowSize = createMemo(() => {
    const cols = colCount();
    const vw = viewportWidth();
    const containerW = Math.max(280, vw - (vw >= 768 ? 260 : 0) - 48);
    const colW = (containerW - (cols - 1) * 16) / cols;
    return Math.round(colW * 1.5 + 52 + 16);
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
      () => `${props.seasonWindow.season}:${props.seasonWindow.year}`,
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
    return allResults().slice(startIdx, startIdx + cols);
  };

  let lastRequestedLength = -1;

  createEffect(() => {
    if (!props.query.hasNextPage) {
      lastRequestedLength = -1;
      return;
    }
    const virtualItems = virtualRows();
    if (virtualItems.length === 0) return;
    const lastItem = virtualItems[virtualItems.length - 1];
    if (!lastItem) return;

    if (
      lastItem.index >= rowCount() - 2 &&
      lastRequestedLength !== allResults().length &&
      !props.query.isFetchingNextPage
    ) {
      lastRequestedLength = allResults().length;
      void props.query.fetchNextPage();
    }
  });

  return (
    <section class="flex flex-col flex-1 min-h-0 space-y-4">
      <div class="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 class="text-lg font-semibold tracking-tight text-foreground">Seasonal Anime</h2>
          <p class="text-xs text-muted-foreground">
            Trending for this season, paged by popularity.
          </p>
        </div>

        <div class="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            class="h-9 w-9"
            onClick={props.onPrevious}
            aria-label="Previous season"
            disabled={props.query.isFetching}
          >
            <IconChevronLeft class="h-4 w-4" />
          </Button>
          <span class="min-w-[132px] select-none text-center text-sm font-medium text-foreground">
            {formatSeasonWindowLabel(props.seasonWindow)}
          </span>
          <Button
            variant="outline"
            size="icon"
            class="h-9 w-9"
            onClick={props.onNext}
            aria-label="Next season"
            disabled={props.query.isFetching}
          >
            <IconChevronRight class="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Show when={isDegraded()}>
        <div class="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <IconInfoCircle class="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            AniList is temporarily unavailable or rate-limited. Showing Jikan fallback titles mapped
            to AniList IDs.
          </p>
        </div>
      </Show>

      <Show when={props.query.isError && !props.query.data}>
        <div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load seasonal anime.
          <Button
            type="button"
            variant="link"
            class="h-auto px-1 py-0 text-destructive underline hover:no-underline"
            onClick={() => props.query.refetch()}
          >
            Try again
          </Button>
        </div>
      </Show>

      <Show when={!props.query.isError && allResults().length === 0 && !props.query.isLoading}>
        <div class="flex flex-col items-center justify-center py-10 text-muted-foreground border-2 border-dashed rounded-lg bg-muted/10">
          <p class="text-sm">No seasonal anime found for this period.</p>
        </div>
      </Show>

      <Show when={allResults().length > 0}>
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
                  <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    <For each={rowItems(vRow.index)}>
                      {(anime) => (
                        <AnimeSearchResultCard
                          anime={anime}
                          added={props.libraryIds.has(anime.id)}
                          onSelect={props.onSelectAnime}
                          compact
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
    </section>
  );
}
