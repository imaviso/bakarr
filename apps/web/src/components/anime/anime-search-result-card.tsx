import { CalendarIcon, CheckIcon, TelevisionIcon, PlusIcon } from "@phosphor-icons/react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import type { AnimeSearchResult } from "~/lib/api";
import { animeAltTitles, animeDisplayTitle, animeSearchSubtitle } from "~/lib/anime-metadata";
import { formatMatchConfidence } from "~/lib/scanned-file";
import { cn } from "~/lib/utils";

function AltTitlesSubtitle({ anime }: { anime: AnimeSearchResult }) {
  const titles = animeAltTitles(anime).slice(1).join(" \u2022 ");
  if (!titles) return null;
  return (
    <p className="text-xs text-muted-foreground line-clamp-1 mb-2" title={titles}>
      {titles}
    </p>
  );
}

interface AnimeSearchResultCardProps {
  anime: AnimeSearchResult;
  added: boolean;
  onSelect: (anime: AnimeSearchResult) => void;
  showSearchMeta?: boolean;
  searchDegraded?: boolean;
  compact?: boolean;
}

export function AnimeSearchResultCard(props: AnimeSearchResultCardProps) {
  return (
    <Card className="overflow-hidden flex flex-col transition-colors hover:border-primary/50 group">
      <div className="relative aspect-[2/3] w-full bg-muted overflow-hidden">
        {props.anime.cover_image ? (
          <img
            src={props.anime.cover_image}
            alt={animeDisplayTitle(props.anime)}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <TelevisionIcon className="h-12 w-12 text-muted-foreground" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
          <Button
            size="sm"
            variant={props.added ? "secondary" : "default"}
            className="w-full gap-2"
            disabled={props.added}
            onClick={() => props.onSelect(props.anime)}
          >
            {props.added ? (
              <>
                <CheckIcon className="h-4 w-4" />
                Already Added
              </>
            ) : (
              <>
                <PlusIcon className="h-4 w-4" />
                Add to Library
              </>
            )}
          </Button>
        </div>
      </div>
      <CardContent className={cn("p-4 flex-1", props.compact ? "p-3" : "p-4")}>
        <h3
          className={cn(
            "font-medium leading-tight line-clamp-2 mb-1",
            props.compact ? "text-sm" : "",
          )}
          title={props.anime.title.romaji}
        >
          {animeDisplayTitle(props.anime)}
        </h3>
        {!props.compact && (
          <AltTitlesSubtitle anime={props.anime} />
        )}
        <div className="flex flex-wrap gap-1.5 mt-auto">
          {props.searchDegraded && (
            <Badge
              variant="outline"
              className="text-xs h-5 px-1.5 font-normal border-warning/20 bg-warning/5 text-warning"
            >
              Local only
            </Badge>
          )}
          {props.showSearchMeta && formatMatchConfidence(props.anime.match_confidence) && (
            <Badge
              variant="outline"
              className="text-xs h-5 px-1.5 font-normal border-info/30 text-info"
            >
              {formatMatchConfidence(props.anime.match_confidence)}
            </Badge>
          )}
          {props.anime.format && (
            <Badge variant="outline" className="text-xs h-5 px-1.5 font-normal">
              {props.anime.format}
            </Badge>
          )}
          {props.anime.episode_count && (
            <Badge variant="outline" className="text-xs h-5 px-1.5 font-normal">
              {props.anime.episode_count} eps
            </Badge>
          )}
          {props.anime.status && (
            <Badge
              variant="outline"
              className={cn(
                "text-xs h-5 px-1.5 font-normal capitalize",
                props.anime.status?.toLowerCase() === "releasing"
                  ? "text-success border-success/30"
                  : "text-muted-foreground",
              )}
            >
              {props.anime.status?.replace("_", " ").toLowerCase()}
            </Badge>
          )}
          {animeSearchSubtitle(props.anime) && (
            <Badge variant="outline" className="text-xs h-5 px-1.5 font-normal">
              <CalendarIcon className="mr-1 h-3 w-3" />
              {animeSearchSubtitle(props.anime)}
            </Badge>
          )}
          {props.anime.genres?.length && (
            <Badge variant="outline" className="text-xs h-5 px-1.5 font-normal">
              {props.anime.genres?.slice(0, 2).join(" / ")}
            </Badge>
          )}
        </div>
        {!props.compact && props.anime.description && (
          <p className="mt-2 text-xs text-muted-foreground line-clamp-3">
            {props.anime.description}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
