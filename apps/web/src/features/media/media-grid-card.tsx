import { RiDeleteBinLine, RiTvLine } from "@remixicon/react";
import { Link } from "@tanstack/react-router";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";
import { StatDot } from "@/components/shared/stat-dot";
import type { Media } from "@/api/contracts";
import type { useDeleteMediaMutation } from "@/api/media-mutations";
import {
  animeDateSubtitle,
  formatNextAiringUnit,
  type getAiringDisplayPreferences,
} from "@/domain/media/metadata";
import { mediaKindLabel } from "@/domain/media-unit";
import { MediaProgressBar, progressTone } from "@/features/media/media-progress-bar";
import {
  nextProgressLabel,
  progressPercent,
  progressSummary,
  statusTone,
} from "@/features/media/media-grid-helpers";

interface MediaGridCardProps {
  media: Media;
  airingPreferences: ReturnType<typeof getAiringDisplayPreferences>;
  deleteMedia: ReturnType<typeof useDeleteMediaMutation>;
}

export function MediaGridCard(props: MediaGridCardProps) {
  const media = props.media;
  return (
    <Card className="group relative flex flex-col overflow-hidden bg-card card-hover transition-colors">
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-muted border-b border-border">
        <Link to="/media/$id" params={{ id: media.id.toString() }} className="block h-full w-full">
          {media.cover_image ? (
            <img
              src={media.cover_image}
              alt={media.title.english || media.title.romaji}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <RiTvLine className="h-12 w-12 opacity-20" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-scrim/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        </Link>
        <div className="absolute right-2 top-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 has-[:focus-visible]:opacity-100">
          <ConfirmDialog
            title={`Delete ${mediaKindLabel(media.media_kind)}`}
            description={`Are you sure you want to delete "${media.title.english || media.title.romaji}"? This action cannot be undone.`}
            confirmLabel="Delete"
            destructive
            isPending={props.deleteMedia.isPending && props.deleteMedia.variables === media.id}
            onConfirm={() => props.deleteMedia.mutate(media.id)}
            trigger={
              <Button
                size="icon"
                variant="secondary"
                aria-label={`Delete ${media.title.english || media.title.romaji}`}
                className="relative after:absolute after:-inset-3 h-8 w-8 bg-background/90 hover:bg-destructive hover:text-destructive-foreground"
              >
                <RiDeleteBinLine className="h-3.5 w-3.5" />
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
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <Badge variant={statusTone(media)} className="h-5 rounded-none px-1.5 font-normal">
              {media.next_airing_unit ? "Airing" : media.monitored ? "Monitored" : "Unmonitored"}
            </Badge>
            {animeDateSubtitle(media) && <span>{animeDateSubtitle(media)}</span>}
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{progressSummary(media)}</span>
              {progressPercent(media) !== null && <span>{progressPercent(media)}%</span>}
            </div>
            <MediaProgressBar
              percent={progressPercent(media)}
              tone={progressTone(media.progress.next_missing_unit, media.monitored)}
            />
          </div>
          <div className="line-clamp-1 text-xs text-muted-foreground">
            {formatNextAiringUnit(media.next_airing_unit, props.airingPreferences) ||
              nextProgressLabel(media)}
          </div>
        </div>
        <div className="mt-auto flex items-center justify-between gap-2">
          <Badge
            variant="outline"
            className="h-5 rounded-none border-border px-1.5 text-xs font-normal text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {media.profile_name}
          </Badge>
          <TooltipTrigger>
            <Button
              variant="ghost"
              className="p-1 -mr-1 h-auto hover:bg-muted transition-colors rounded-full"
            >
              <StatDot variant={media.monitored ? "success" : "muted"} />
            </Button>
            <Tooltip>{media.monitored ? "Monitored" : "Unmonitored"}</Tooltip>
          </TooltipTrigger>
        </div>
      </div>
    </Card>
  );
}
