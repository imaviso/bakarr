import {
  WarningIcon,
  CalendarIcon,
  InfoIcon,
  SpinnerIcon,
  PlusIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { useDeferredValue, useRef, useState } from "react";
import { AnimeDiscoveryRow } from "~/features/anime/anime-discovery";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import type { AnimeSearchResult } from "~/api/contracts";
import { createAnimeSearchQuery } from "~/api/anime";
import { animeDisplayTitle, animeSearchSubtitle } from "~/domain/anime/metadata";
import { formatMatchConfidence } from "~/domain/scanned-file";
import { cn } from "~/infra/utils";

interface ManualSearchCoreProps {
  addedIndicator: "badge" | "text";
  autoFocusInput?: boolean;
  containerClass?: string;
  disableSelectionForAdded: boolean;
  emptyPrompt: string;
  existingIds?: ReadonlySet<number>;
  onSelect: (anime: AnimeSearchResult) => void;
}

export function ManualSearchCore(props: ManualSearchCoreProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDeferredValue(query);

  const search = createAnimeSearchQuery(debouncedQuery);
  const searchResults = search.data?.results ?? [];
  const searchDegraded = search.data?.degraded ?? false;
  const existing = props.existingIds ? [...props.existingIds] : [];
  const discovered = (search.data?.results ?? [])
    .filter((anime) => anime.already_in_library)
    .map((anime) => anime.id);
  const libraryIds = new Set([...existing, ...discovered]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          ref={searchInputRef}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Search for anime..."
          aria-label="Search anime title"
          className="pl-9"
        />
        {search.isFetching && (
          <SpinnerIcon className="absolute right-3 top-3 h-3 w-3 animate-spin text-muted-foreground" />
        )}
      </div>

      {searchDegraded && (
        <div className="rounded-none border border-border bg-muted px-2.5 py-2 text-[11px] text-muted-foreground">
          <div className="flex items-start gap-2">
            <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              AniList is temporarily unavailable or rate-limited. Showing local library matches
              only.
            </span>
          </div>
        </div>
      )}

      <div className={cn("h-[300px] border rounded-none overflow-y-auto", props.containerClass)}>
        {debouncedQuery ? (
          searchResults.length !== 0 ? (
            <div className="divide-y">
              {searchResults.map((anime) => {
                const isAdded = props.existingIds?.has(anime.id) ?? false;
                return (
                  <button
                    key={anime.id}
                    type="button"
                    disabled={props.disableSelectionForAdded && isAdded}
                    onClick={() => props.onSelect(anime)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 text-left transition-colors",
                      props.disableSelectionForAdded && isAdded
                        ? "opacity-50 cursor-not-allowed bg-muted"
                        : "hover:bg-muted",
                    )}
                  >
                    <div className="h-10 w-10 shrink-0 rounded-none bg-muted overflow-hidden">
                      {anime.cover_image && (
                        <img
                          src={anime.cover_image}
                          alt={animeDisplayTitle(anime)}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{animeDisplayTitle(anime)}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {anime.title.english}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1 text-xs text-muted-foreground">
                        {searchDegraded && (
                          <Badge
                            variant="outline"
                            className="h-5 px-1.5 text-xs border-warning/20 bg-warning/5 text-warning"
                          >
                            Local only
                          </Badge>
                        )}
                        {formatMatchConfidence(anime.match_confidence) && (
                          <Badge variant="outline" className="h-5 px-1.5 text-xs">
                            {formatMatchConfidence(anime.match_confidence)}
                          </Badge>
                        )}
                        {anime.format && <span>{anime.format}</span>}
                        {anime.episode_count && <span>{anime.episode_count} eps</span>}
                        {animeSearchSubtitle(anime) && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarIcon className="h-3 w-3" />
                            {animeSearchSubtitle(anime)}
                          </span>
                        )}
                        {anime.genres?.length && (
                          <span>{anime.genres?.slice(0, 2).join(" / ")}</span>
                        )}
                      </div>
                      {anime.description && (
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                          {anime.description}
                        </p>
                      )}
                      {anime.synonyms?.length && (
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                          Also known as {anime.synonyms?.slice(0, 3).join(" • ")}
                        </p>
                      )}
                      {anime.related_anime?.length && (
                        <div className="mt-1 space-y-1">
                          {anime.related_anime?.slice(0, 2).map((related) => (
                            <AnimeDiscoveryRow
                              key={`${related.id ?? "related"}-${animeDisplayTitle(related)}`}
                              entry={related}
                              libraryIds={libraryIds}
                              compact
                            />
                          ))}
                        </div>
                      )}
                      {anime.recommended_anime?.length && (
                        <div className="mt-1 space-y-1">
                          {anime.recommended_anime?.slice(0, 2).map((recommended) => (
                            <AnimeDiscoveryRow
                              key={`${recommended.id ?? "recommended"}-${animeDisplayTitle(recommended)}`}
                              entry={recommended}
                              libraryIds={libraryIds}
                              compact
                            />
                          ))}
                        </div>
                      )}
                      {anime.match_reason && (
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                          {anime.match_reason}
                        </p>
                      )}
                    </div>
                    {props.addedIndicator === "text" &&
                      (isAdded ? (
                        <span className="text-xs text-muted-foreground">Added</span>
                      ) : (
                        <PlusIcon className="h-4 w-4 text-muted-foreground" />
                      ))}
                    {props.addedIndicator === "badge" && anime.already_in_library && (
                      <Badge variant="secondary">In library</Badge>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
              <WarningIcon className="h-8 w-8 mb-2 opacity-20" />
              <p className="text-sm">No results found</p>
            </div>
          )
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
            <MagnifyingGlassIcon className="h-8 w-8 mb-2 opacity-20" />
            <p className="text-sm">{props.emptyPrompt}</p>
          </div>
        )}
      </div>
    </div>
  );
}
