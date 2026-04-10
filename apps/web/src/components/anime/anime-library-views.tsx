import { IconDeviceTv, IconTrash } from "@tabler/icons-solidjs";
import { Link } from "@tanstack/solid-router";
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { createVirtualizer } from "@tanstack/solid-virtual";
import { DeleteAnimeDialog } from "~/components/delete-anime-dialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { type Anime, createDeleteAnimeMutation } from "~/lib/api";
import {
  animeDateSubtitle,
  formatNextAiringEpisode,
  type getAiringDisplayPreferences,
} from "~/lib/anime-metadata";
import { cn } from "~/lib/utils";

interface AnimeLibraryViewProps {
  anime: Anime[];
  airingPreferences: ReturnType<typeof getAiringDisplayPreferences>;
  deleteAnime: ReturnType<typeof createDeleteAnimeMutation>;
}

function getColCount() {
  const w = globalThis.innerWidth;
  if (w >= 1536) return 6;
  if (w >= 1280) return 5;
  if (w >= 1024) return 4;
  if (w >= 640) return 3;
  return 2;
}

function progressPercent(anime: Anime) {
  return anime.progress.downloaded_percent ?? null;
}

function progressSummary(anime: Anime) {
  const total = anime.progress.total;
  const percent = anime.progress.downloaded_percent;

  if (total) {
    return percent !== undefined
      ? `${anime.progress.downloaded}/${total} downloaded • ${percent}%`
      : `${anime.progress.downloaded}/${total} downloaded`;
  }

  return `${anime.progress.downloaded} downloaded`;
}

function nextProgressLabel(anime: Anime) {
  if (anime.progress.is_up_to_date) {
    return "Up to date";
  }

  if (anime.progress.next_missing_episode) {
    return `Next missing: Ep ${anime.progress.next_missing_episode}`;
  }

  if (anime.progress.latest_downloaded_episode) {
    return `Latest: Ep ${anime.progress.latest_downloaded_episode}`;
  }

  return anime.progress.downloaded > 0 ? "Episodes available" : "No downloads yet";
}

function statusTone(anime: Anime) {
  if (anime.next_airing_episode) return "success" as const;
  if (anime.progress.is_up_to_date) return "secondary" as const;
  if (anime.progress.next_missing_episode) return "warning" as const;
  return anime.monitored ? ("outline" as const) : ("secondary" as const);
}

export function AnimeGridView(props: AnimeLibraryViewProps) {
  let scrollRef: HTMLDivElement | undefined;
  const [colCount, setColCount] = createSignal(getColCount());
  const [viewportWidth, setViewportWidth] = createSignal(globalThis.innerWidth);

  onMount(() => {
    let rafId: number;
    const handler = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setViewportWidth(globalThis.innerWidth);
        setColCount(getColCount());
      });
    };
    globalThis.addEventListener("resize", handler);
    onCleanup(() => {
      globalThis.removeEventListener("resize", handler);
      cancelAnimationFrame(rafId);
    });
  });

  const rowCount = createMemo(() => Math.ceil(props.anime.length / colCount()));

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
    overscan: 2,
    getScrollElement: () => scrollRef ?? null,
  });

  const gridPaddingTop = createMemo(() => {
    const items = rowVirtualizer.getVirtualItems();
    const [first] = items;
    return first ? first.start : 0;
  });
  const gridPaddingBottom = createMemo(() => {
    const items = rowVirtualizer.getVirtualItems();
    const last = items[items.length - 1];
    return last ? rowVirtualizer.getTotalSize() - last.end : 0;
  });

  const visibleItems = createMemo(() => {
    const items: Array<{ anime: Anime; key: number }> = [];
    const cols = colCount();
    for (const vRow of rowVirtualizer.getVirtualItems()) {
      const startIdx = vRow.index * cols;
      const rowSlice = props.anime.slice(startIdx, startIdx + cols);
      for (const anime of rowSlice) {
        items.push({ anime, key: anime.id });
      }
    }
    return items;
  });

  return (
    <div
      ref={(el) => {
        scrollRef = el;
      }}
      class="overflow-y-auto flex-1 min-h-0"
      style={{ "overflow-anchor": "none" }}
    >
      <div style={{ height: `${gridPaddingTop()}px` }} aria-hidden="true" />
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 pb-4">
        <For each={visibleItems()} fallback={null}>
          {(item) => {
            const anime = item.anime;
            return (
              <Card class="group relative flex flex-col overflow-hidden bg-card card-hover transition-colors">
                <div class="relative aspect-[2/3] w-full overflow-hidden bg-muted border-b border-border">
                  <Link
                    to="/anime/$id"
                    params={{ id: anime.id.toString() }}
                    class="block h-full w-full"
                  >
                    <Show
                      when={anime.cover_image}
                      fallback={
                        <div class="flex h-full items-center justify-center text-muted-foreground">
                          <IconDeviceTv class="h-12 w-12 opacity-20" />
                        </div>
                      }
                    >
                      <img
                        src={anime.cover_image}
                        alt={anime.title.english || anime.title.romaji}
                        loading="lazy"
                        class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    </Show>
                    <div class="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </Link>
                  <div class="absolute right-2 top-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
                    <DeleteAnimeDialog
                      title={anime.title.english || anime.title.romaji}
                      onConfirm={() => props.deleteAnime.mutate(anime.id)}
                      trigger={
                        <Button
                          size="icon"
                          variant="secondary"
                          class="relative after:absolute after:-inset-3 h-8 w-8 shadow-sm bg-background/90 hover:bg-destructive hover:text-destructive-foreground"
                        >
                          <IconTrash class="h-3.5 w-3.5" />
                        </Button>
                      }
                    />
                  </div>
                </div>
                <div class="flex flex-1 flex-col gap-2 p-3">
                  <Link
                    to="/anime/$id"
                    params={{ id: anime.id.toString() }}
                    class="line-clamp-1 text-sm font-medium leading-tight text-foreground/90 transition-colors hover:text-primary"
                    title={anime.title.english || anime.title.romaji}
                  >
                    {anime.title.english || anime.title.romaji}
                  </Link>
                  <div class="space-y-2">
                    <div class="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Badge variant={statusTone(anime)} class="h-5 rounded-sm px-1.5 font-normal">
                        {anime.next_airing_episode
                          ? "Airing"
                          : anime.monitored
                            ? "Monitored"
                            : "Unmonitored"}
                      </Badge>
                      <Show when={animeDateSubtitle(anime)}>
                        <span>{animeDateSubtitle(anime)}</span>
                      </Show>
                    </div>
                    <div class="space-y-1">
                      <div class="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span>{progressSummary(anime)}</span>
                        <Show when={progressPercent(anime) !== null}>
                          <span>{progressPercent(anime)}%</span>
                        </Show>
                      </div>
                      <div class="h-1.5 overflow-hidden bg-muted">
                        <div
                          class={cn(
                            "h-full transition-[width]",
                            anime.progress.next_missing_episode
                              ? "bg-warning"
                              : anime.monitored
                                ? "bg-primary"
                                : "bg-muted-foreground/40",
                          )}
                          style={{ width: `${progressPercent(anime) ?? 0}%` }}
                        />
                      </div>
                    </div>
                    <div class="line-clamp-1 text-[11px] text-muted-foreground">
                      {formatNextAiringEpisode(
                        anime.next_airing_episode,
                        props.airingPreferences,
                      ) || nextProgressLabel(anime)}
                    </div>
                  </div>
                  <div class="mt-auto flex items-center justify-between gap-2">
                    <div class="flex items-center gap-1.5">
                      <Badge
                        variant="outline"
                        class="h-5 rounded-sm border-border/50 px-1.5 text-xs font-normal text-muted-foreground/80 hover:bg-muted hover:text-foreground"
                      >
                        {anime.profile_name}
                      </Badge>
                    </div>
                    <Tooltip>
                      <TooltipTrigger
                        as={Button}
                        variant="ghost"
                        class="p-1 -mr-1 h-auto hover:bg-muted/50 transition-colors rounded-full"
                      >
                        <div class="flex items-center gap-1.5">
                          <div
                            class={cn(
                              "h-1.5 w-1.5 rounded-full",
                              anime.monitored
                                ? "bg-success shadow-[0_0_4px_hsl(var(--success)/0.4)]"
                                : "bg-muted-foreground/40",
                            )}
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        {anime.monitored ? "Monitored" : "Unmonitored"}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </Card>
            );
          }}
        </For>
      </div>
      <div style={{ height: `${gridPaddingBottom()}px` }} aria-hidden="true" />
    </div>
  );
}

export function AnimeListView(props: AnimeLibraryViewProps) {
  let scrollRef: HTMLDivElement | undefined;
  const rowVirtualizer = createVirtualizer({
    get count() {
      return props.anime.length;
    },
    estimateSize: () => 72,
    getScrollElement: () => scrollRef ?? null,
    overscan: 10,
  });

  const paddingTop = createMemo(() => {
    const items = rowVirtualizer.getVirtualItems();
    const [first] = items;
    return first ? first.start : 0;
  });
  const paddingBottom = createMemo(() => {
    const items = rowVirtualizer.getVirtualItems();
    const last = items[items.length - 1];
    return last ? rowVirtualizer.getTotalSize() - last.end : 0;
  });

  return (
    <div
      ref={(el) => {
        scrollRef = el;
      }}
      class="flex-1 min-h-0 overflow-y-auto rounded-md border"
      style={{ "overflow-anchor": "none" }}
    >
      <Table>
        <TableHeader class="sticky top-0 bg-card z-10 shadow-sm shadow-border/50">
          <TableRow class="hover:bg-transparent border-none">
            <TableHead class="w-[80px]">Cover</TableHead>
            <TableHead>Title</TableHead>
            <TableHead class="hidden lg:table-cell">Schedule</TableHead>
            <TableHead class="hidden md:table-cell">Progress</TableHead>
            <TableHead>Status</TableHead>
            <TableHead class="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <tr aria-hidden="true">
            <td
              colSpan={6}
              style={{
                height: `${paddingTop()}px`,
                padding: "0",
                border: "none",
              }}
            />
          </tr>
          <For each={rowVirtualizer.getVirtualItems()}>
            {(vRow) => {
              const anime = props.anime[vRow.index];
              if (!anime) {
                return null;
              }
              return (
                <TableRow>
                  <TableCell>
                    <Link
                      to="/anime/$id"
                      params={{ id: anime.id.toString() }}
                      class="block w-12 h-16 overflow-hidden bg-muted"
                    >
                      <Show
                        when={anime.cover_image}
                        fallback={
                          <div class="flex items-center justify-center h-full text-muted-foreground">
                            <IconDeviceTv class="h-6 w-6" />
                          </div>
                        }
                      >
                        <img
                          src={anime.cover_image}
                          alt={anime.title.english || anime.title.romaji}
                          loading="lazy"
                          class="w-full h-full object-cover"
                        />
                      </Show>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link to="/anime/$id" params={{ id: anime.id.toString() }} class="block group">
                      <div class="font-medium group-hover:text-primary transition-colors">
                        {anime.title.english || anime.title.romaji}
                      </div>
                      <div class="text-xs text-muted-foreground">{anime.profile_name}</div>
                      <div class="text-xs text-muted-foreground mt-1">
                        {animeDateSubtitle(anime) || "No date metadata"}
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell class="hidden lg:table-cell">
                    <div class="text-sm">
                      {formatNextAiringEpisode(
                        anime.next_airing_episode,
                        props.airingPreferences,
                      ) || "No upcoming airing"}
                    </div>
                  </TableCell>
                  <TableCell class="hidden md:table-cell">
                    <div class="space-y-1">
                      <div class="text-sm">{progressSummary(anime)}</div>
                      <div class="text-xs text-muted-foreground">{nextProgressLabel(anime)}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div class="flex flex-col items-start gap-1">
                      <div class="flex items-center gap-2">
                        <div
                          class={`h-2 w-2 rounded-full ${anime.monitored ? "bg-success" : "bg-warning"}`}
                        />
                        <span class="text-sm">{anime.monitored ? "Monitored" : "Unmonitored"}</span>
                      </div>
                      <Show when={anime.next_airing_episode}>
                        <Badge variant="success" class="px-1.5 py-0 text-xs">
                          Airing
                        </Badge>
                      </Show>
                    </div>
                  </TableCell>
                  <TableCell class="text-right">
                    <div class="flex items-center justify-end gap-1">
                      <DeleteAnimeDialog
                        title={anime.title.english || anime.title.romaji}
                        onConfirm={() => props.deleteAnime.mutate(anime.id)}
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon"
                            class="relative after:absolute after:-inset-3 h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={(e: Event) => e.stopPropagation()}
                          >
                            <IconTrash class="h-4 w-4" />
                          </Button>
                        }
                      />
                    </div>
                  </TableCell>
                </TableRow>
              );
            }}
          </For>
          <tr aria-hidden="true">
            <td
              colSpan={6}
              style={{
                height: `${paddingBottom()}px`,
                padding: "0",
                border: "none",
              }}
            />
          </tr>
        </TableBody>
      </Table>
    </div>
  );
}
