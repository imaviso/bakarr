import { PlayIcon } from "@phosphor-icons/react";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import { SectionLabel } from "~/components/shared/section-label";
import type { Media } from "~/api/contracts";

const COMPACT_NUMBER = new Intl.NumberFormat(undefined, { notation: "compact" });

interface AnimeDetailsSidebarProps {
  media: Media;
}

export function AnimeDetailsSidebar(props: AnimeDetailsSidebarProps) {
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        {props.media.cover_image ? (
          <img
            src={props.media.cover_image}
            alt={props.media.title.english || props.media.title.romaji}
            loading="lazy"
            className="w-full aspect-[2/3] object-cover"
          />
        ) : (
          <div className="w-full aspect-[2/3] bg-muted flex items-center justify-center">
            <PlayIcon className="h-16 w-16 text-muted-foreground" />
          </div>
        )}
      </Card>

      {props.media.score && (
        <Card>
          <CardContent className="p-3 flex items-center justify-between">
            <span className="text-sm font-medium">Score</span>
            <span className="font-bold text-lg">{props.media.score}</span>
          </CardContent>
        </Card>
      )}

      {(props.media.source ||
        props.media.duration ||
        props.media.rating ||
        props.media.rank ||
        props.media.popularity ||
        props.media.members ||
        props.media.favorites) && (
        <Card>
          <CardContent className="p-3">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              {props.media.source && (
                <div>
                  <dt className="text-muted-foreground">Source</dt>
                  <dd className="font-medium">{props.media.source}</dd>
                </div>
              )}
              {props.media.duration && (
                <div>
                  <dt className="text-muted-foreground">Duration</dt>
                  <dd className="font-medium">{props.media.duration}</dd>
                </div>
              )}
              {props.media.rating && (
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Rating</dt>
                  <dd className="font-medium">{props.media.rating}</dd>
                </div>
              )}
              {props.media.rank && (
                <div>
                  <dt className="text-muted-foreground">Rank</dt>
                  <dd className="font-medium">#{props.media.rank}</dd>
                </div>
              )}
              {props.media.popularity && (
                <div>
                  <dt className="text-muted-foreground">Popularity</dt>
                  <dd className="font-medium">#{props.media.popularity}</dd>
                </div>
              )}
              {props.media.members && (
                <div>
                  <dt className="text-muted-foreground">Members</dt>
                  <dd className="font-medium">{COMPACT_NUMBER.format(props.media.members ?? 0)}</dd>
                </div>
              )}
              {props.media.favorites && (
                <div>
                  <dt className="text-muted-foreground">Favorites</dt>
                  <dd className="font-medium">
                    {COMPACT_NUMBER.format(props.media.favorites ?? 0)}
                  </dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      )}

      {props.media.studios && props.media.studios.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel as="h2">Studios</SectionLabel>
          <div className="flex flex-wrap gap-1">
            {props.media.studios.map((studio) => (
              <Badge key={studio} variant="outline">
                {studio}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {props.media.genres && props.media.genres.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel as="h2">Genres</SectionLabel>
          <div className="flex flex-wrap gap-1">
            {props.media.genres.map((genre) => (
              <Badge key={genre} variant="secondary" className="text-xs">
                {genre}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
