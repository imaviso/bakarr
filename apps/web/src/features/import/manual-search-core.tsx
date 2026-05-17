import {
  WarningIcon,
  CalendarIcon,
  InfoIcon,
  SpinnerIcon,
  PlusIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { useMemo, useRef, useState } from "react";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { MediaDiscoveryRow } from "~/features/media/media-discovery";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import type { MediaSearchResult, MediaKind } from "~/api/contracts";
import { useMediaSearchQuery } from "~/api/media";
import { animeDisplayTitle, animeSearchSubtitle } from "~/domain/media/metadata";
import { mediaKindLabel, mediaUnitShortLabel } from "~/domain/media-unit";
import { formatMatchConfidence } from "~/domain/scanned-file";
import { cn } from "~/infra/utils";

const SEARCH_DEBOUNCE_MS = 250;

interface ManualSearchCoreProps {
  addedIndicator: "badge" | "text";
  autoFocusInput?: boolean;
  containerClass?: string;
  disableSelectionForAdded: boolean;
  emptyPrompt: string;
  existingIds?: ReadonlySet<number>;
  onSelect: (anime: MediaSearchResult) => void;
}

export function ManualSearchCore(props: ManualSearchCoreProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [mediaKind, setMediaKind] = useState<MediaKind>("anime");
  const [debouncedQuery] = useDebouncedValue(query, { wait: SEARCH_DEBOUNCE_MS });

  const search = useMediaSearchQuery(debouncedQuery, mediaKind);
  const searchResults = search.data?.results ?? [];
  const searchDegraded = search.data?.degraded ?? false;
  const libraryIds = useMemo(() => {
    const ids = new Set(props.existingIds);
    for (const media of search.data?.results ?? []) {
      if (media.already_in_library) ids.add(media.id);
    }
    return ids;
  }, [props.existingIds, search.data?.results]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder={`Search for ${mediaKindLabel(mediaKind)}...`}
            aria-label={`Search ${mediaKindLabel(mediaKind)} title`}
            className="pl-9"
          />
          {search.isFetching && (
            <SpinnerIcon className="absolute right-3 top-3 h-3 w-3 animate-spin text-muted-foreground" />
          )}
        </div>
        <Select
          value={mediaKind}
          onValueChange={(value) => {
            if (value !== null) {
              setMediaKind(toMediaKind(value));
            }
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="anime">Anime</SelectItem>
            <SelectItem value="manga">Manga</SelectItem>
            <SelectItem value="light_novel">Light novel</SelectItem>
          </SelectContent>
        </Select>
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
              {searchResults.map((media) => {
                const isAdded = props.existingIds?.has(media.id) ?? false;
                return (
                  <button
                    key={media.id}
                    type="button"
                    disabled={props.disableSelectionForAdded && isAdded}
                    onClick={() => props.onSelect(media)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 text-left transition-colors",
                      props.disableSelectionForAdded && isAdded
                        ? "opacity-50 cursor-not-allowed bg-muted"
                        : "hover:bg-muted",
                    )}
                  >
                    <div className="h-10 w-10 shrink-0 rounded-none bg-muted overflow-hidden">
                      {media.cover_image && (
                        <img
                          src={media.cover_image}
                          alt={animeDisplayTitle(media)}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{animeDisplayTitle(media)}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {media.title.english}
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
                        {formatMatchConfidence(media.match_confidence) && (
                          <Badge variant="outline" className="h-5 px-1.5 text-xs">
                            {formatMatchConfidence(media.match_confidence)}
                          </Badge>
                        )}
                        {media.format && <span>{media.format}</span>}
                        {(media.unit_count || media.volume_count) && (
                          <span>
                            {mediaUnitShortLabel(
                              media.media_kind === "anime" ? "episode" : "volume",
                              media.media_kind === "anime"
                                ? (media.unit_count ?? 0)
                                : (media.volume_count ?? media.unit_count ?? 0),
                            )}
                          </span>
                        )}
                        {animeSearchSubtitle(media) && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarIcon className="h-3 w-3" />
                            {animeSearchSubtitle(media)}
                          </span>
                        )}
                        {media.genres?.length && (
                          <span>{media.genres?.slice(0, 2).join(" / ")}</span>
                        )}
                      </div>
                      {media.description && (
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                          {media.description}
                        </p>
                      )}
                      {media.synonyms?.length && (
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                          Also known as {media.synonyms?.slice(0, 3).join(" • ")}
                        </p>
                      )}
                      {media.related_media?.length && (
                        <div className="mt-1 space-y-1">
                          {media.related_media?.slice(0, 2).map((related) => (
                            <MediaDiscoveryRow
                              key={`${related.id ?? "related"}-${animeDisplayTitle(related)}`}
                              entry={related}
                              libraryIds={libraryIds}
                              compact
                            />
                          ))}
                        </div>
                      )}
                      {media.recommended_media?.length && (
                        <div className="mt-1 space-y-1">
                          {media.recommended_media?.slice(0, 2).map((recommended) => (
                            <MediaDiscoveryRow
                              key={`${recommended.id ?? "recommended"}-${animeDisplayTitle(recommended)}`}
                              entry={recommended}
                              libraryIds={libraryIds}
                              compact
                            />
                          ))}
                        </div>
                      )}
                      {media.match_reason && (
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                          {media.match_reason}
                        </p>
                      )}
                    </div>
                    {props.addedIndicator === "text" &&
                      (isAdded ? (
                        <span className="text-xs text-muted-foreground">Added</span>
                      ) : (
                        <PlusIcon className="h-4 w-4 text-muted-foreground" />
                      ))}
                    {props.addedIndicator === "badge" && media.already_in_library && (
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

function toMediaKind(value: string): MediaKind {
  return value === "manga" || value === "light_novel" ? value : "anime";
}
