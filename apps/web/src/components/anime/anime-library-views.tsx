import { TelevisionIcon, TrashIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useContainerWidth } from "~/hooks/use-container-width";
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

function getColCount(w: number) {
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
  if (anime.next_airing_episode) return "default" as const;
  if (anime.progress.is_up_to_date) return "secondary" as const;
  if (anime.progress.next_missing_episode) return "destructive" as const;
  return anime.monitored ? ("outline" as const) : ("secondary" as const);
}

export function AnimeGridView(props: AnimeLibraryViewProps) {
  const [containerRef, width, nodeRef] = useContainerWidth();
  const colCount = getColCount(width);
  const containerW = Math.max(280, width);
  const colW = (containerW - (colCount - 1) * 16) / colCount;
  const estimateRowSize = Math.round(colW * 1.5 + 68 + 16);
  const rowCount = Math.ceil(props.anime.length / colCount);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    estimateSize: () => estimateRowSize,
    overscan: 2,
    getScrollElement: () => nodeRef.current,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  const rowItems = (rowIndex: number) => {
    const startIdx = rowIndex * colCount;
    return props.anime.slice(startIdx, startIdx + colCount);
  };

  return (
    <div
      ref={containerRef}
      className="h-full min-h-0 overflow-y-auto overflow-x-hidden"
      style={{ overflowAnchor: "none" }}
    >
      <div className="relative w-full" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
        {virtualItems.map((vRow) => (
          <div
            key={vRow.key}
            data-index={vRow.index}
            ref={rowVirtualizer.measureElement}
            className="absolute left-0 top-0 w-full"
            style={{ transform: `translateY(${vRow.start}px)` }}
          >
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}
            >
              {rowItems(vRow.index).map((anime) => (
                <Card
                  key={anime.id}
                  className="group relative flex flex-col overflow-hidden bg-card card-hover transition-colors"
                >
                  <div className="relative aspect-[2/3] w-full overflow-hidden bg-muted border-b border-border">
                    <Link
                      to="/anime/$id"
                      params={{ id: anime.id.toString() }}
                      className="block h-full w-full"
                    >
                      {anime.cover_image ? (
                        <img
                          src={anime.cover_image}
                          alt={anime.title.english || anime.title.romaji}
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground">
                          <TelevisionIcon className="h-12 w-12 opacity-20" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    </Link>
                    <div className="absolute right-2 top-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 has-[:focus-visible]:opacity-100">
                      <DeleteAnimeDialog
                        title={anime.title.english || anime.title.romaji}
                        onConfirm={() => props.deleteAnime.mutate(anime.id)}
                        trigger={
                          <Button
                            size="icon"
                            variant="secondary"
                            className="relative after:absolute after:-inset-3 h-8 w-8 bg-background/90 hover:bg-destructive hover:text-destructive-foreground"
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                          </Button>
                        }
                      />
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-3">
                    <Link
                      to="/anime/$id"
                      params={{ id: anime.id.toString() }}
                      className="line-clamp-1 text-sm font-medium leading-tight text-foreground transition-colors hover:text-primary"
                      title={anime.title.english || anime.title.romaji}
                    >
                      {anime.title.english || anime.title.romaji}
                    </Link>
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Badge
                          variant={statusTone(anime)}
                          className="h-5 rounded-none px-1.5 font-normal"
                        >
                          {anime.next_airing_episode
                            ? "Airing"
                            : anime.monitored
                              ? "Monitored"
                              : "Unmonitored"}
                        </Badge>
                        {animeDateSubtitle(anime) && <span>{animeDateSubtitle(anime)}</span>}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                          <span>{progressSummary(anime)}</span>
                          {progressPercent(anime) !== null && (
                            <span>{progressPercent(anime)}%</span>
                          )}
                        </div>
                        <div className="h-1.5 overflow-hidden bg-muted">
                          <div
                            className={cn(
                              "h-full transition-[width] duration-300 ease-out will-change-[width]",
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
                      <div className="line-clamp-1 text-[11px] text-muted-foreground">
                        {formatNextAiringEpisode(
                          anime.next_airing_episode,
                          props.airingPreferences,
                        ) || nextProgressLabel(anime)}
                      </div>
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className="h-5 rounded-none border-border px-1.5 text-xs font-normal text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          {anime.profile_name}
                        </Badge>
                      </div>
                      <Tooltip>
                        <TooltipTrigger
                          render={<Button variant="ghost" />}
                          className="p-1 -mr-1 h-auto hover:bg-muted transition-colors rounded-full"
                        >
                          <div className="flex items-center gap-1.5">
                            <div
                              className={cn(
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
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AnimeListView(props: AnimeLibraryViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: props.anime.length,
    estimateSize: () => 72,
    getScrollElement: () => scrollRef.current ?? null,
    overscan: 10,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const firstVirtualItem = virtualItems[0];
  const lastVirtualItem = virtualItems[virtualItems.length - 1];

  const paddingTop = firstVirtualItem ? firstVirtualItem.start : 0;
  const paddingBottom = lastVirtualItem ? rowVirtualizer.getTotalSize() - lastVirtualItem.end : 0;

  return (
    <div
      ref={scrollRef}
      className="h-full min-h-0 overflow-auto rounded-none border"
      style={{ overflowAnchor: "none" }}
    >
      <Table className="table-fixed w-full min-w-[760px] lg:min-w-0">
        <TableHeader className="sticky top-0 bg-card z-10 border-b">
          <TableRow className="hover:bg-transparent border-none">
            <TableHead className="w-[80px]">Cover</TableHead>
            <TableHead>Title</TableHead>
            <TableHead className="hidden lg:table-cell">Schedule</TableHead>
            <TableHead className="hidden md:table-cell">Progress</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <tr aria-hidden="true">
            <td
              colSpan={6}
              style={{
                height: `${paddingTop}px`,
                padding: "0",
                border: "none",
              }}
            />
          </tr>
          {virtualItems.map((vRow) => {
            const anime = props.anime[vRow.index];
            if (!anime) {
              return null;
            }
            return (
              <TableRow key={anime.id}>
                <TableCell>
                  <Link
                    to="/anime/$id"
                    params={{ id: anime.id.toString() }}
                    className="block w-12 h-16 overflow-hidden bg-muted"
                  >
                    {anime.cover_image ? (
                      <img
                        src={anime.cover_image}
                        alt={anime.title.english || anime.title.romaji}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        <TelevisionIcon className="h-6 w-6" />
                      </div>
                    )}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link
                    to="/anime/$id"
                    params={{ id: anime.id.toString() }}
                    className="block group"
                  >
                    <div className="font-medium group-hover:text-primary transition-colors">
                      {anime.title.english || anime.title.romaji}
                    </div>
                    <div className="text-xs text-muted-foreground">{anime.profile_name}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {animeDateSubtitle(anime) || "No date metadata"}
                    </div>
                  </Link>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <div className="text-sm">
                    {formatNextAiringEpisode(anime.next_airing_episode, props.airingPreferences) ||
                      "No upcoming airing"}
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <div className="space-y-1">
                    <div className="text-sm">{progressSummary(anime)}</div>
                    <div className="text-xs text-muted-foreground">{nextProgressLabel(anime)}</div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-2 w-2 rounded-full ${anime.monitored ? "bg-success" : "bg-warning"}`}
                      />
                      <span className="text-sm">
                        {anime.monitored ? "Monitored" : "Unmonitored"}
                      </span>
                    </div>
                    {anime.next_airing_episode && (
                      <Badge variant="default" className="px-1.5 py-0 text-xs">
                        Airing
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <DeleteAnimeDialog
                      title={anime.title.english || anime.title.romaji}
                      onConfirm={() => props.deleteAnime.mutate(anime.id)}
                      trigger={
                        <Button
                          variant="ghost"
                          size="icon"
                          className="relative after:absolute after:-inset-3 h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </Button>
                      }
                    />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
          <tr aria-hidden="true">
            <td
              colSpan={6}
              style={{
                height: `${paddingBottom}px`,
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
