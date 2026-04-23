import type { DownloadSelectionKind } from "@bakarr/shared";
import type { ReactNode } from "react";
import { ReleaseSeaDexMeta, ReleaseSelectionMeta } from "~/components/release-search/release-meta";
import { ReleaseMetadataSummary } from "~/components/release-metadata-summary";
import type { ReleaseFlag } from "~/lib/release-metadata";
import type { ReleaseConfidenceMetadata } from "~/lib/release-selection";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

interface ReleasePrimaryCellProps {
  confidence?: ReleaseConfidenceMetadata | undefined;
  flags: ReleaseFlag[];
  metadataPrefix?: ReactNode | undefined;
  parsedSummary?: string | undefined;
  seadexComparison?: string | undefined;
  seadexNotes?: string | undefined;
  seadexTagClass?: string | undefined;
  seadexTags?: string[] | undefined;
  seadexClass?: string | undefined;
  selectionClass?: string | undefined;
  selectionDetail?: string | undefined;
  selectionKind?: DownloadSelectionKind | undefined;
  selectionLabel?: string | undefined;
  selectionSummary?: string | undefined;
  sourceSummary?: string | undefined;
  sourceUrl?: string | undefined;
  summaryCompact?: boolean | undefined;
  title: string;
  titleClass?: string | undefined;
  useTooltip?: boolean | undefined;
}

export function ReleasePrimaryCell(props: ReleasePrimaryCellProps) {
  const titleClass =
    props.titleClass ??
    "text-sm font-medium leading-none text-foreground hover:text-primary transition-colors truncate block pr-4";

  return (
    <div className="flex flex-col gap-1.5">
      {props.useTooltip ? (
        <Tooltip>
          <TooltipTrigger>
            <a
              href={props.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={titleClass}
            >
              {props.title}
            </a>
          </TooltipTrigger>
          <TooltipContent className="max-w-[400px]">
            <p className="break-words font-normal">{props.title}</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        <a href={props.sourceUrl} target="_blank" rel="noopener noreferrer" className={titleClass}>
          {props.title}
        </a>
      )}
      <div className={cn("text-xs text-muted-foreground", props.summaryCompact && "space-y-1")}>
        {props.metadataPrefix}
        <ReleaseMetadataSummary
          compact={props.summaryCompact}
          flags={props.flags}
          parsedSummary={props.parsedSummary}
          sourceSummary={props.sourceSummary}
          sourceUrl={props.sourceUrl}
        />
      </div>
      <ReleaseSeaDexMeta
        notes={props.seadexNotes}
        tags={props.seadexTags}
        comparisonUrl={props.seadexComparison}
        className={props.seadexClass}
        tagClass={props.seadexTagClass}
      />
      <ReleaseSelectionMeta
        selectionKind={props.selectionKind}
        selectionLabel={props.selectionLabel}
        selectionSummary={props.selectionSummary}
        selectionDetail={props.selectionDetail}
        confidence={props.confidence}
        className={props.selectionClass}
      />
    </div>
  );
}

interface ReleasePeersCellProps {
  emphasizePresence?: boolean;
  leechers: number;
  seeders: number;
}

export function ReleasePeersCell(props: ReleasePeersCellProps) {
  return (
    <div className="flex items-center justify-end gap-1.5 text-xs font-mono">
      <span
        className={cn(
          "font-medium",
          props.emphasizePresence
            ? "text-success"
            : props.seeders > 0
              ? "text-success dark:text-success"
              : "text-muted-foreground",
        )}
      >
        {props.seeders}
      </span>
      <span className="text-muted-foreground">/</span>
      <span className={props.emphasizePresence ? "text-error" : "text-muted-foreground"}>
        {props.leechers}
      </span>
    </div>
  );
}
