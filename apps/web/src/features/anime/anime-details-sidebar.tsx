import { PlayIcon } from "@phosphor-icons/react";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import type { Anime } from "~/api/contracts";

interface AnimeDetailsSidebarProps {
  anime: Anime;
}

export function AnimeDetailsSidebar(props: AnimeDetailsSidebarProps) {
  const compactNumber = new Intl.NumberFormat(undefined, { notation: "compact" });

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        {props.anime.cover_image ? (
          <img
            src={props.anime.cover_image}
            alt={props.anime.title.english || props.anime.title.romaji}
            loading="lazy"
            className="w-full aspect-[2/3] object-cover"
          />
        ) : (
          <div className="w-full aspect-[2/3] bg-muted flex items-center justify-center">
            <PlayIcon className="h-16 w-16 text-muted-foreground" />
          </div>
        )}
      </Card>

      {props.anime.score && (
        <Card>
          <CardContent className="p-3 flex items-center justify-between">
            <span className="text-sm font-medium">Score</span>
            <span className="font-bold text-lg">{props.anime.score}</span>
          </CardContent>
        </Card>
      )}

      {(props.anime.source ||
        props.anime.duration ||
        props.anime.rating ||
        props.anime.rank ||
        props.anime.popularity ||
        props.anime.members ||
        props.anime.favorites) && (
        <Card>
          <CardContent className="p-3">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              {props.anime.source && (
                <div>
                  <dt className="text-muted-foreground">Source</dt>
                  <dd className="font-medium">{props.anime.source}</dd>
                </div>
              )}
              {props.anime.duration && (
                <div>
                  <dt className="text-muted-foreground">Duration</dt>
                  <dd className="font-medium">{props.anime.duration}</dd>
                </div>
              )}
              {props.anime.rating && (
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Rating</dt>
                  <dd className="font-medium">{props.anime.rating}</dd>
                </div>
              )}
              {props.anime.rank && (
                <div>
                  <dt className="text-muted-foreground">Rank</dt>
                  <dd className="font-medium">#{props.anime.rank}</dd>
                </div>
              )}
              {props.anime.popularity && (
                <div>
                  <dt className="text-muted-foreground">Popularity</dt>
                  <dd className="font-medium">#{props.anime.popularity}</dd>
                </div>
              )}
              {props.anime.members && (
                <div>
                  <dt className="text-muted-foreground">Members</dt>
                  <dd className="font-medium">{compactNumber.format(props.anime.members ?? 0)}</dd>
                </div>
              )}
              {props.anime.favorites && (
                <div>
                  <dt className="text-muted-foreground">Favorites</dt>
                  <dd className="font-medium">
                    {compactNumber.format(props.anime.favorites ?? 0)}
                  </dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      )}

      {props.anime.studios && props.anime.studios.length > 0 && (
        <div className="space-y-1.5">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Studios
          </h2>
          <div className="flex flex-wrap gap-1">
            {props.anime.studios.map((studio) => (
              <Badge key={studio} variant="outline" className="text-xs">
                {studio}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {props.anime.genres && props.anime.genres.length > 0 && (
        <div className="space-y-1.5">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Genres
          </h2>
          <div className="flex flex-wrap gap-1">
            {props.anime.genres.map((genre) => (
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
