import { RiDeleteBinLine, RiTvLine } from "@remixicon/react";
import { Link } from "@tanstack/react-router";
import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useContainerWidth } from "@/hooks/use-container-width";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Media } from "@/api/contracts";
import { useDeleteMediaMutation } from "@/api/media-mutations";
import {
  animeDateSubtitle,
  formatNextAiringUnit,
  type getAiringDisplayPreferences,
} from "@/domain/media/metadata";
import { mediaKindLabel } from "@/domain/media-unit";
import {
  getColCount,
  GRID_GAP_PX,
  nextProgressLabel,
  progressSummary,
} from "@/features/media/media-grid-helpers";
import { MediaGridCard } from "@/features/media/media-grid-card";

interface AnimeLibraryViewProps {
  media: Media[];
  airingPreferences: ReturnType<typeof getAiringDisplayPreferences>;
  deleteMedia: ReturnType<typeof useDeleteMediaMutation>;
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
                <MediaGridCard
                  key={media.id}
                  media={media}
                  airingPreferences={props.airingPreferences}
                  deleteMedia={props.deleteMedia}
                />
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
            <TableHead scope="col" className="w-20">
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
            <td colSpan={6} style={{ height: `${paddingTop}px`, padding: "0", border: "none" }} />
          </tr>
          {virtualItems.map((vRow) => {
            const media = props.media[vRow.index];
            if (!media) return null;
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
                        <RiTvLine className="h-6 w-6" />
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
                    <ConfirmDialog
                      title={`Delete ${mediaKindLabel(media.media_kind)}`}
                      description={`Are you sure you want to delete "${media.title.english || media.title.romaji}"? This action cannot be undone.`}
                      confirmLabel="Delete"
                      destructive
                      isPending={
                        props.deleteMedia.isPending && props.deleteMedia.variables === media.id
                      }
                      onConfirm={() => props.deleteMedia.mutate(media.id)}
                      trigger={
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${media.title.english || media.title.romaji}`}
                          className="relative after:absolute after:-inset-3 h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        >
                          <RiDeleteBinLine className="h-4 w-4" />
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
              style={{ height: `${paddingBottom}px`, padding: "0", border: "none" }}
            />
          </tr>
        </TableBody>
      </Table>
    </div>
  );
}
