import { ArrowSquareOutIcon, SparkleIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { DownloadSelectionKind } from "@bakarr/shared";
import type { ReactNode } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import type { ReleaseConfidenceMetadata } from "~/domain/release/selection";
import {
  releaseConfidenceBadgeClass,
  selectionKindBadgeClass,
  selectionKindLabel,
} from "~/domain/release/selection";
import { safeExternalUrl } from "~/infra/utils";

function animeInitials(title: string) {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

interface DownloadRowMetaProps {
  animeId?: number | undefined;
  animeImage?: string | undefined;
  animeTitle: string;
  confidence?: ReleaseConfidenceMetadata | undefined;
  decisionBadge?: string | undefined;
  decisionSummary?: string | undefined;
  downloadId?: number | undefined;
  errorMessage?: string | undefined;
  importedPath?: string | undefined;
  parsedSummary?: string | undefined;
  releaseName: string;
  releaseSummary?: string | undefined;
  selectionDetail?: string | undefined;
  selectionKind?: DownloadSelectionKind | undefined;
  sourceUrl?: string | undefined;
  trusted?: boolean | undefined;
  remake?: boolean | undefined;
  children?: ReactNode;
}

export function DownloadRowMeta(props: DownloadRowMetaProps) {
  const sourceUrl = safeExternalUrl(props.sourceUrl);

  return (
    <div className="flex items-start gap-3">
      <Avatar className="size-8 rounded-none">
        <AvatarImage
          {...(props.animeImage === undefined ? {} : { src: props.animeImage })}
          alt={props.animeTitle}
        />
        <AvatarFallback className="rounded-none text-xs font-medium">
          {animeInitials(props.animeTitle)}
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-col justify-center min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          {props.animeId !== undefined ? (
            <Link
              to="/anime/$id"
              params={{ id: props.animeId.toString() }}
              className="line-clamp-1 text-sm hover:underline min-w-0 max-w-full"
              title={props.animeTitle}
            >
              {props.animeTitle}
            </Link>
          ) : (
            <span className="line-clamp-1 min-w-0 max-w-full">{props.animeTitle}</span>
          )}
          {props.decisionBadge && (
            <Badge variant="secondary" className="h-5 px-1.5 text-xs shrink-0">
              <SparkleIcon className="h-3 w-3" />
              {props.decisionBadge}
            </Badge>
          )}
        </div>
        <span className="line-clamp-1 text-xs text-muted-foreground" title={props.releaseName}>
          {props.releaseName}
        </span>
        {props.releaseSummary && (
          <span className="text-xs text-muted-foreground line-clamp-1">{props.releaseSummary}</span>
        )}
        {props.decisionSummary && (
          <span className="text-[11px] text-muted-foreground line-clamp-1">
            {props.decisionSummary}
          </span>
        )}
        {props.parsedSummary && (
          <span className="text-[11px] text-muted-foreground line-clamp-1">
            {props.parsedSummary}
          </span>
        )}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] leading-tight">
          {props.trusted && (
            <Badge
              variant="outline"
              className="h-4 px-1.5 border-success/20 bg-success/5 text-success"
            >
              Trusted
            </Badge>
          )}
          {props.remake && (
            <Badge
              variant="outline"
              className="h-4 px-1.5 border-warning/20 bg-warning/5 text-warning"
            >
              Remake
            </Badge>
          )}
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:text-primary"
            >
              <ArrowSquareOutIcon className="h-3 w-3" /> Source
            </a>
          )}
        </div>
        {(props.selectionKind || props.selectionDetail) && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] leading-tight">
            {selectionKindLabel(props.selectionKind) && (
              <Badge
                variant="secondary"
                className={`h-4 px-1.5 ${selectionKindBadgeClass(props.selectionKind)}`}
              >
                {selectionKindLabel(props.selectionKind)}
              </Badge>
            )}
            {props.selectionDetail && (
              <span className="text-muted-foreground line-clamp-1">{props.selectionDetail}</span>
            )}
          </div>
        )}
        {props.confidence && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] leading-tight">
            <Badge
              variant="secondary"
              className={`h-4 px-1.5 ${releaseConfidenceBadgeClass(props.confidence.tone)}`}
            >
              {props.confidence.label}
            </Badge>
            <span className="text-muted-foreground line-clamp-1">{props.confidence.reason}</span>
          </div>
        )}
        {props.children}
        {props.importedPath && (
          <span className="text-[11px] text-muted-foreground line-clamp-1">
            Imported to {props.importedPath}
          </span>
        )}
        {props.errorMessage && (
          <span className="text-xs text-destructive line-clamp-1">{props.errorMessage}</span>
        )}
        {props.downloadId !== undefined && (
          <span className="text-xs text-muted-foreground">#{props.downloadId}</span>
        )}
      </div>
    </div>
  );
}
