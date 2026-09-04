import { RiExternalLinkLine } from "@remixicon/react";
import type { DownloadSelectionKind } from "@bakarr/shared";
import { Badge } from "@/components/ui/badge";
import {
  releaseConfidenceBadgeClass,
  selectionKindBadgeClass,
  type ReleaseConfidenceMetadata,
} from "@/domain/release/selection";
import { cn, safeExternalUrl } from "@/infra/utils";

interface ReleaseSeaDexMetaProps {
  notes?: string | null | undefined;
  tags?: string[] | null | undefined;
  comparisonUrl?: string | null | undefined;
  className?: string | null | undefined;
  tagClass?: string | null | undefined;
}

export function ReleaseSeaDexMeta(props: ReleaseSeaDexMetaProps) {
  const comparisonUrl = safeExternalUrl(props.comparisonUrl);
  return (
    <>
      {props.notes || props.tags?.length || comparisonUrl ? (
        <div className={cn("flex flex-col gap-1 text-xs text-muted-foreground", props.className)}>
          {props.notes && <span className="line-clamp-2">{props.notes}</span>}
          {props.tags?.length ? (
            <div className="flex flex-wrap gap-1">
              {(props.tags ?? []).slice(0, 4).map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className={cn(
                    "h-4 px-1 text-xs bg-muted text-muted-foreground border-transparent",
                    props.tagClass,
                  )}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}
          {comparisonUrl && (
            <a
              href={comparisonUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary w-fit"
            >
              <RiExternalLinkLine className="h-3 w-3" /> Compare notes
            </a>
          )}
        </div>
      ) : null}
    </>
  );
}

interface ReleaseSelectionMetaProps {
  selectionKind?: DownloadSelectionKind | null | undefined;
  selectionLabel?: string | null | undefined;
  selectionSummary?: string | null | undefined;
  selectionDetail?: string | null | undefined;
  confidence?: ReleaseConfidenceMetadata | null | undefined;
  className?: string | null | undefined;
  selectionClass?: string | null | undefined;
  confidenceClass?: string | null | undefined;
  detailClass?: string | null | undefined;
}

export function ReleaseSelectionMeta(props: ReleaseSelectionMetaProps) {
  return (
    <>
      {props.selectionSummary ? (
        <div
          className={cn(
            "flex flex-wrap items-center gap-1.5 text-xs leading-tight",
            props.className,
            props.selectionClass,
          )}
        >
          {props.selectionLabel && (
            <Badge
              variant="secondary"
              className={cn(
                "h-4 px-1.5 border-transparent",
                selectionKindBadgeClass(props.selectionKind),
              )}
            >
              {props.selectionLabel}
            </Badge>
          )}
          {props.selectionDetail && (
            <div className={cn("text-muted-foreground", props.detailClass)}>
              {props.selectionDetail}
            </div>
          )}
        </div>
      ) : null}
      {props.confidence ? (
        <div
          className={cn(
            "flex flex-wrap items-center gap-1.5 text-xs leading-tight",
            props.className,
            props.confidenceClass,
          )}
        >
          <Badge
            variant="secondary"
            className={cn(
              "h-4 px-1.5 border-transparent",
              releaseConfidenceBadgeClass(props.confidence.tone),
            )}
          >
            {props.confidence.label}
          </Badge>
          <div className="text-muted-foreground">{props.confidence.reason}</div>
        </div>
      ) : null}
    </>
  );
}
