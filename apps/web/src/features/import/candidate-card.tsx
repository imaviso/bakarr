import { CheckIcon, FileIcon } from "@phosphor-icons/react";
import { MediaDiscoveryRow } from "~/features/media/media-discovery";
import { Badge } from "~/components/ui/badge";
import { Toggle } from "~/components/ui/toggle";
import { Tooltip, TooltipTrigger } from "~/components/ui/tooltip";
import type { MediaSearchResult } from "~/api/contracts";
import { animeDisplayTitle, animeSearchSubtitle } from "~/domain/media/metadata";
import { cn } from "~/infra/utils";

interface CandidateCardProps {
  candidate: MediaSearchResult;
  libraryIds: ReadonlySet<number>;
  isSelected: boolean;
  isLocal: boolean;
  isManual: boolean;
  onToggle: () => void;
  className?: string;
}

export function CandidateCard(props: CandidateCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden border bg-background transition-colors hover:",
        props.isSelected
          ? "border-primary bg-primary/10 ring-1 ring-primary/20"
          : "border-border hover:border-primary/50",
        props.className,
      )}
    >
      <Toggle
        isSelected={props.isSelected}
        onChange={props.onToggle}
        className="h-auto w-full gap-3 rounded-none p-3 text-left font-normal hover:bg-transparent"
      >
        <div className="relative h-16 w-12 shrink-0 overflow-hidden bg-muted">
          {props.candidate.cover_image ? (
            <img
              src={props.candidate.cover_image}
              alt={animeDisplayTitle(props.candidate)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted">
              <FileIcon className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
          {props.isSelected && (
            <div className="absolute inset-0 flex items-center justify-center bg-primary/30">
              <CheckIcon className="h-5 w-5 text-white drop-" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <TooltipTrigger>
            <span className="block line-clamp-2 text-sm font-medium leading-tight">
              {animeDisplayTitle(props.candidate)}
            </span>
            <Tooltip>
              <p>{animeDisplayTitle(props.candidate)}</p>
            </Tooltip>
          </TooltipTrigger>

          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {!props.isLocal && <Badge>New</Badge>}
            {props.isManual && (
              <Badge
                variant="secondary"
                className="h-4 px-1 text-xs bg-accent/10 text-accent border-accent/20"
              >
                Manual
              </Badge>
            )}
            <span className="font-mono">ID: {props.candidate.id}</span>
            {props.candidate.format && (
              <Badge variant="outline" className="h-4 px-1 text-xs">
                {props.candidate.format}
              </Badge>
            )}
            {animeSearchSubtitle(props.candidate) && (
              <Badge variant="outline" className="h-4 px-1 text-xs">
                {animeSearchSubtitle(props.candidate)}
              </Badge>
            )}
          </div>

          {props.candidate.match_reason && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {props.candidate.match_reason}
            </p>
          )}
          {props.candidate.genres?.length ? (
            <p className="text-xs text-muted-foreground line-clamp-1">
              {props.candidate.genres?.slice(0, 2).join(" / ")}
            </p>
          ) : null}
          {props.candidate.synonyms?.length ? (
            <p className="text-xs text-muted-foreground line-clamp-2">
              Also known as {props.candidate.synonyms?.slice(0, 2).join(" • ")}
            </p>
          ) : null}
        </div>
      </Toggle>

      {props.candidate.related_media?.length || props.candidate.recommended_media?.length ? (
        <div className="space-y-1 border-t border-border bg-muted px-3 py-2">
          {props.candidate.related_media?.length ? (
            <>
              {props.candidate.related_media?.slice(0, 2).map((related) => (
                <MediaDiscoveryRow
                  key={`${related.id ?? "related"}-${animeDisplayTitle(related)}`}
                  entry={related}
                  libraryIds={props.libraryIds}
                  compact
                />
              ))}
            </>
          ) : null}
          {props.candidate.recommended_media?.length ? (
            <>
              {props.candidate.recommended_media?.slice(0, 2).map((recommended) => (
                <MediaDiscoveryRow
                  key={`${recommended.id ?? "recommended"}-${animeDisplayTitle(recommended)}`}
                  entry={recommended}
                  libraryIds={props.libraryIds}
                  compact
                />
              ))}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
