import { Link } from "@tanstack/react-router";
import { buttonVariants } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import type { Anime } from "~/api/contracts";
import { animeDiscoverySubtitle, animeDisplayTitle } from "~/domain/anime/metadata";
import { cn } from "~/infra/utils";

type DiscoveryEntry = NonNullable<Anime["related_anime"]>[number];

interface AnimeDiscoveryRowProps {
  entry: DiscoveryEntry;
  libraryIds: ReadonlySet<number>;
  compact?: boolean;
  onNavigate?: () => void;
}

export function AnimeDiscoveryRow(props: AnimeDiscoveryRowProps) {
  const subtitle = animeDiscoverySubtitle({
    format: props.entry.format,
    relation_type: props.entry.relation_type,
    season: props.entry.season,
    season_year: props.entry.season_year,
    start_year: props.entry.start_year,
    status: props.entry.status,
  }).join(" - ");
  const isInLibrary = props.libraryIds.has(props.entry.id);

  return (
    <div
      className={cn(
        "flex items-start gap-2 border border-border bg-muted text-xs",
        props.compact ? "p-1.5" : "p-2",
      )}
    >
      {props.entry.cover_image && (
        <img
          src={props.entry.cover_image}
          alt={animeDisplayTitle(props.entry)}
          className={cn(
            "shrink-0 border border-border object-cover",
            props.compact ? "h-10 w-7" : "h-12 w-8",
          )}
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="font-medium text-foreground">{animeDisplayTitle(props.entry)}</div>
        {subtitle && <div className="mt-1 text-muted-foreground">{subtitle}</div>}
      </div>
      {isInLibrary ? (
        <Link
          to="/anime/$id"
          params={{ id: props.entry.id.toString() }}
          onClick={props.onNavigate}
          aria-label={`Open ${animeDisplayTitle(props.entry)}`}
          className={buttonVariants({
            size: "sm",
            variant: "outline",
            className: props.compact ? "h-6 px-1.5 text-xs" : "h-7 px-2 text-xs",
          })}
        >
          Open
        </Link>
      ) : (
        <Link
          to="/anime/add"
          search={{ id: props.entry.id.toString() }}
          onClick={props.onNavigate}
          aria-label={`Add ${animeDisplayTitle(props.entry)}`}
          className={buttonVariants({
            size: "sm",
            className: props.compact ? "h-6 px-1.5 text-xs" : "h-7 px-2 text-xs",
          })}
        >
          Add
        </Link>
      )}
    </div>
  );
}

interface AnimeDiscoverySectionProps {
  anime: Anime;
  libraryIds: ReadonlySet<number>;
}

export function AnimeDiscoverySection(props: AnimeDiscoverySectionProps) {
  const related = (props.anime.related_anime ?? []).filter((entry) => entry.id !== props.anime.id);
  const relatedIds = new Set(related.map((entry) => entry.id));
  const recommended = (props.anime.recommended_anime ?? []).filter(
    (entry) => entry.id !== props.anime.id && !relatedIds.has(entry.id),
  );

  if (related.length === 0 && recommended.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Related & Recommended</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {related.length > 0 && (
          <section className="space-y-2">
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Franchise
            </div>
            <div className="space-y-2">
              {related.map((entry) => (
                <AnimeDiscoveryRow key={entry.id} entry={entry} libraryIds={props.libraryIds} />
              ))}
            </div>
          </section>
        )}

        {recommended.length > 0 && (
          <section className="space-y-2">
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Recommended
            </div>
            <div className="space-y-2">
              {recommended.slice(0, 6).map((entry) => (
                <AnimeDiscoveryRow key={entry.id} entry={entry} libraryIds={props.libraryIds} />
              ))}
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
