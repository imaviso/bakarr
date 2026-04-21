import { CheckIcon, FileIcon } from "@phosphor-icons/react";
import { AnimeDiscoveryRow } from "~/components/anime-discovery";
import { Badge } from "~/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import type { AnimeSearchResult } from "~/lib/api";
import { animeDisplayTitle, animeSearchSubtitle } from "~/lib/anime-metadata";
import { cn } from "~/lib/utils";

interface CandidateCardProps {
  candidate: AnimeSearchResult;
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
        "relative overflow-hidden border bg-background transition-colors hover:shadow-sm",
        props.isSelected
          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
          : "border-border hover:border-primary/50",
        props.className,
      )}
    >
      <button
        type="button"
        className="flex w-full gap-3 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        onClick={props.onToggle}
        aria-pressed={props.isSelected}
      >
        <div className="relative h-16 w-12 shrink-0 overflow-hidden bg-muted shadow-sm">
          {props.candidate.cover_image ? (
            <img
              src={props.candidate.cover_image}
              alt={animeDisplayTitle(props.candidate)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted/50">
              <FileIcon className="h-4 w-4 text-muted-foreground/50" />
            </div>
          )}
          {props.isSelected && (
            <div className="absolute inset-0 flex items-center justify-center bg-primary/20 backdrop-blur-[1px]">
              <CheckIcon className="h-5 w-5 text-white drop-shadow-sm" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <Tooltip>
            <TooltipTrigger render={<span />}>
              <span className="block line-clamp-2 text-sm font-medium leading-tight">
                {animeDisplayTitle(props.candidate)}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>{animeDisplayTitle(props.candidate)}</p>
            </TooltipContent>
          </Tooltip>

          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {!props.isLocal && (
              <Badge
                variant="secondary"
                className="h-4 px-1 text-xs bg-info/10 text-info border-info/20"
              >
                New
              </Badge>
            )}
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
      </button>

      {props.candidate.related_anime?.length || props.candidate.recommended_anime?.length ? (
        <div className="space-y-1 border-t border-border/60 bg-muted/20 px-3 py-2">
          {props.candidate.related_anime?.length ? (
            <>
              {props.candidate.related_anime?.slice(0, 2).map((related) => (
                <AnimeDiscoveryRow
                  key={`${related.id ?? "related"}-${animeDisplayTitle(related)}`}
                  entry={related}
                  libraryIds={props.libraryIds}
                  compact
                />
              ))}
            </>
          ) : null}
          {props.candidate.recommended_anime?.length ? (
            <>
              {props.candidate.recommended_anime?.slice(0, 2).map((recommended) => (
                <AnimeDiscoveryRow
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
