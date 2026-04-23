import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { Badge } from "~/components/ui/badge";
import type { ReleaseFlag } from "~/lib/release-metadata";
import { releaseFlagBadgeClass } from "~/lib/release-metadata";

interface ReleaseMetadataSummaryProps {
  flags?: readonly ReleaseFlag[] | undefined;
  sourceSummary?: string | undefined;
  parsedSummary?: string | undefined;
  sourceUrl?: string | undefined;
  compact?: boolean | undefined;
}

export function ReleaseMetadataSummary(props: ReleaseMetadataSummaryProps) {
  return (
    <div className={props.compact ? "flex flex-col gap-0.5" : "flex flex-col gap-1"}>
      {(props.flags?.length ?? 0) > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {props.flags?.map((flag) => (
            <Badge
              key={`${flag.kind}-${flag.label}`}
              variant="outline"
              className={`inline-flex items-center rounded-none h-4 px-1 text-xs font-normal ${releaseFlagBadgeClass(flag.kind)}`}
            >
              {flag.label}
            </Badge>
          ))}
        </div>
      )}
      {props.sourceSummary && (
        <div className="text-xs text-muted-foreground leading-tight">{props.sourceSummary}</div>
      )}
      {(props.parsedSummary || props.sourceUrl) && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground leading-tight">
          {props.parsedSummary && <span>{props.parsedSummary}</span>}
          {props.sourceUrl && (
            <a
              href={props.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:text-primary"
            >
              <ArrowSquareOutIcon className="h-3 w-3" />
              Source
            </a>
          )}
        </div>
      )}
    </div>
  );
}
