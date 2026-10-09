import { RiExternalLinkLine } from "@remixicon/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSeaDexEntryQuery } from "@/api/media";
import { ReleaseSeaDexMeta } from "@/features/search/release-cells/release-meta";
import { releaseFlagBadgeClass } from "@/domain/release/metadata";
import { cn, safeExternalUrl } from "@/infra/utils";
import type { SeaDexEntry } from "@/api/contracts";

interface MediaSeaDexReleasesProps {
  mediaId: number;
  mediaKind: string;
}

function sortReleases(releases: SeaDexEntry["releases"]) {
  return releases.toSorted(
    (left, right) =>
      Number(right.isBest) - Number(left.isBest) ||
      left.releaseGroup.localeCompare(right.releaseGroup),
  );
}

export function MediaSeaDexReleases(props: MediaSeaDexReleasesProps) {
  const query = useSeaDexEntryQuery(props.mediaId, {
    enabled: props.mediaKind === "anime",
  });

  if (props.mediaKind !== "anime") {
    return null;
  }

  if (query.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">SeaDex Releases</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </Card>
    );
  }

  if (query.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">SeaDex Releases</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>SeaDex is unavailable right now.</span>
          <Button variant="outline" size="sm" onPress={() => void query.refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const entry = query.data;
  if (!entry || entry.releases.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">SeaDex Releases</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No SeaDex releases listed for this anime yet.
        </CardContent>
      </Card>
    );
  }

  const releases = sortReleases(entry.releases);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">SeaDex Releases</CardTitle>
          {entry.incomplete && (
            <Badge variant="outline" className="text-xs">
              Incomplete
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ReleaseSeaDexMeta notes={entry.notes} comparisonUrl={safeExternalUrl(entry.comparison)} />

        <ul className="space-y-2">
          {releases.map((release) => (
            <li
              key={`${release.releaseGroup}-${release.tracker}-${release.url}`}
              className="flex flex-col gap-2 border border-border bg-muted p-2 text-xs sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-foreground">{release.releaseGroup}</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "h-4 px-1.5",
                      releaseFlagBadgeClass(release.isBest ? "seadex_best" : "seadex"),
                    )}
                  >
                    {release.isBest ? "SeaDex Best" : "SeaDex"}
                  </Badge>
                  {release.dualAudio && (
                    <Badge
                      variant="outline"
                      className={cn("h-4 px-1.5", releaseFlagBadgeClass("dual_audio"))}
                    >
                      Dual Audio
                    </Badge>
                  )}
                </div>
                {release.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {release.tags.slice(0, 6).map((tag) => (
                      <Badge key={tag} variant="secondary" className="h-4 px-1 text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="text-muted-foreground">Tracker: {release.tracker}</div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <SeaDexLink href={safeExternalUrl(release.url)} label="Source" />
                <SeaDexLink href={safeExternalUrl(release.groupedUrl)} label="SeaDex" />
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function SeaDexLink(props: { href?: string | undefined; label: string }) {
  if (!props.href) {
    return null;
  }

  return (
    <a
      href={props.href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary"
    >
      <RiExternalLinkLine className="h-3 w-3" />
      {props.label}
    </a>
  );
}
