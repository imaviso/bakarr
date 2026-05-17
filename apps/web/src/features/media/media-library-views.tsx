import { TelevisionIcon, TrashIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useContainerWidth } from "~/hooks/use-container-width";
import { DeleteAnimeDialog } from "~/features/media/delete-media-dialog";
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
import type { Media } from "~/api/contracts";
import { useDeleteMediaMutation } from "~/api/media-mutations";
import {
  animeDateSubtitle,
  formatNextAiringUnit,
  type getAiringDisplayPreferences,
} from "~/domain/media/metadata";
import { mediaKindLabel } from "~/domain/media-unit";
import { cn } from "~/infra/utils";

interface AnimeLibraryViewProps {
  media: Media[];
  airingPreferences: ReturnType<typeof getAiringDisplayPreferences>;
  deleteMedia: ReturnType<typeof useDeleteMediaMutation>;
}

const GRID_GAP_PX = 16;
const MIN_CARD_WIDTH_PX = 220;
const MAX_GRID_COLUMNS = 6;

function getColCount(w: number) {
  const safeWidth = Math.max(0, w);
  const cols = Math.floor((safeWidth + GRID_GAP_PX) / (MIN_CARD_WIDTH_PX + GRID_GAP_PX));
  return Math.min(MAX_GRID_COLUMNS, Math.max(1, cols));
}

function progressPercent(media: Media) {
  return media.progress.downloaded_percent ?? null;
}

function progressSummary(media: Media) {
  const total = media.progress.total;
  const percent = media.progress.downloaded_percent;

  if (total) {
    return percent !== undefined
      ? `${media.progress.downloaded}/${total} downloaded • ${percent}%`
      : `${media.progress.downloaded}/${total} downloaded`;
  }

  return `${media.progress.downloaded} downloaded`;
}

function nextProgressLabel(media: Media) {
  if (media.progress.is_up_to_date) {
    return "Up to date";
  }

  if (media.progress.next_missing_unit) {
    return `Next missing: Ep ${media.progress.next_missing_unit}`;
  }

  if (media.progress.latest_downloaded_unit) {
    return `Latest: Ep ${media.progress.latest_downloaded_unit}`;
  }

  return media.progress.downloaded > 0 ? "Episodes available" : "No downloads yet";
}

function statusTone(media: Media) {
  if (media.next_airing_unit) return "default" as const;
  if (media.progress.is_up_to_date) return "secondary" as const;
  if (media.progress.next_missing_unit) return "destructive" as const;
  return media.monitored ? ("outline" as const) : ("secondary" as const);
}

export function AnimeGridView(props: AnimeLibraryViewProps) {
  const [containerRef, width, nodeRef] = useContainerWidth();
  const colCount = getColCount(width);
  const containerW = Math.max(280, width);
  const colW = Math.floor((containerW - (colCount - 1) * GRID_GAP_PX) / colCount);
  const estimateRowSize = Math.round(colW * 1.5 + 68);
  const rowCount = Math.ceil(props.media.length / colCount);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    estimateSize: () => estimateRowSize,
    gap: GRID_GAP_PX,
    overscan: 2,
    getScrollElement: () => nodeRef.current,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  const rowItems = (rowIndex: number) => {
    const startIdx = rowIndex * colCount;
    return props.media.slice(startIdx, startIdx + colCount);
  };

  return (
    <div
      ref={containerRef}
      className="h-full min-h-0 w-full flex-1 overflow-y-auto overflow-x-hidden"
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
              {rowItems(vRow.index).map((media) => (
                <Card
                  key={media.id}
                  className="group relative flex flex-col overflow-hidden bg-card card-hover transition-colors"
                >
                  <div className="relative aspect-[2/3] w-full overflow-hidden bg-muted border-b border-border">
                    <Link
                      to="/media/$id"
                      params={{ id: media.id.toString() }}
                      className="block h-full w-full"
                    >
                      {media.cover_image ? (
                        <img
                          src={media.cover_image}
                          alt={media.title.english || media.title.romaji}
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
                        mediaLabel={mediaKindLabel(media.media_kind)}
                        title={media.title.english || media.title.romaji}
                        onConfirm={() => props.deleteMedia.mutate(media.id)}
                        trigger={
                          <Button
                            size="icon"
                            variant="secondary"
                            aria-label={`Delete ${media.title.english || media.title.romaji}`}
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
                      to="/media/$id"
                      params={{ id: media.id.toString() }}
                      className="line-clamp-1 text-sm font-medium leading-tight text-foreground transition-colors hover:text-primary"
                      title={media.title.english || media.title.romaji}
                    >
                      {media.title.english || media.title.romaji}
                    </Link>
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Badge
                          variant={statusTone(media)}
                          className="h-5 rounded-none px-1.5 font-normal"
                        >
                          {media.next_airing_unit
                            ? "Airing"
                            : media.monitored
                              ? "Monitored"
                              : "Unmonitored"}
                        </Badge>
                        {animeDateSubtitle(media) && <span>{animeDateSubtitle(media)}</span>}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                          <span>{progressSummary(media)}</span>
                          {progressPercent(media) !== null && (
                            <span>{progressPercent(media)}%</span>
                          )}
                        </div>
                        <div className="h-1.5 overflow-hidden bg-muted">
                          <div
                            className={cn(
                              "h-full origin-left transition-transform duration-300 ease-out",
                              media.progress.next_missing_unit
                                ? "bg-warning"
                                : media.monitored
                                  ? "bg-primary"
                                  : "bg-muted-foreground/40",
                            )}
                            style={{
                              transform: `scaleX(${(progressPercent(media) ?? 0) / 100})`,
                            }}
                          />
                        </div>
                      </div>
                      <div className="line-clamp-1 text-[11px] text-muted-foreground">
                        {formatNextAiringUnit(media.next_airing_unit, props.airingPreferences) ||
                          nextProgressLabel(media)}
                      </div>
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className="h-5 rounded-none border-border px-1.5 text-xs font-normal text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          {media.profile_name}
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
                                media.monitored
                                  ? "bg-success ring-1 ring-success/40"
                                  : "bg-muted-foreground/40",
                              )}
                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          {media.monitored ? "Monitored" : "Unmonitored"}
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
    count: props.media.length,
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
      className="h-full min-h-0 w-full flex-1 overflow-auto rounded-none border"
      style={{ overflowAnchor: "none" }}
    >
      <Table className="table-fixed w-full min-w-0">
        <TableHeader className="sticky top-0 bg-card z-10 border-b">
          <TableRow className="hover:bg-transparent border-none">
            <TableHead scope="col" className="w-[80px]">
              Cover
            </TableHead>
            <TableHead scope="col">Title</TableHead>
            <TableHead scope="col" className="hidden lg:table-cell">
              Schedule
            </TableHead>
            <TableHead scope="col" className="hidden md:table-cell">
              Progress
            </TableHead>
            <TableHead scope="col">Status</TableHead>
            <TableHead scope="col" className="text-right">
              Actions
            </TableHead>
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
            const media = props.media[vRow.index];
            if (!media) {
              return null;
            }
            return (
              <TableRow key={media.id}>
                <TableCell>
                  <Link
                    to="/media/$id"
                    params={{ id: media.id.toString() }}
                    className="block w-12 h-16 overflow-hidden bg-muted"
                  >
                    {media.cover_image ? (
                      <img
                        src={media.cover_image}
                        alt={media.title.english || media.title.romaji}
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
                    to="/media/$id"
                    params={{ id: media.id.toString() }}
                    className="block group"
                  >
                    <div className="font-medium group-hover:text-primary transition-colors">
                      {media.title.english || media.title.romaji}
                    </div>
                    <div className="text-xs text-muted-foreground">{media.profile_name}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {animeDateSubtitle(media) || "No date metadata"}
                    </div>
                  </Link>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <div className="text-sm">
                    {formatNextAiringUnit(media.next_airing_unit, props.airingPreferences) ||
                      "No upcoming airing"}
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <div className="space-y-1">
                    <div className="text-sm">{progressSummary(media)}</div>
                    <div className="text-xs text-muted-foreground">{nextProgressLabel(media)}</div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-2 w-2 rounded-full ${media.monitored ? "bg-success" : "bg-warning"}`}
                      />
                      <span className="text-sm">
                        {media.monitored ? "Monitored" : "Unmonitored"}
                      </span>
                    </div>
                    {media.next_airing_unit && (
                      <Badge variant="default" className="px-1.5 py-0 text-xs">
                        Airing
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <DeleteAnimeDialog
                      mediaLabel={mediaKindLabel(media.media_kind)}
                      title={media.title.english || media.title.romaji}
                      onConfirm={() => props.deleteMedia.mutate(media.id)}
                      trigger={
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${media.title.english || media.title.romaji}`}
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
