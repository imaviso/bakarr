import {
  RiDeleteBinLine,
  RiPauseLine,
  RiPlayLine,
  RiRefreshLine,
  RiSparkling2Line,
} from "@remixicon/react";
import { SectionLabel } from "@/components/shared/section-label";
import { Button } from "@/components/ui/button";
import { StatChip } from "@/features/scan/stat-chip";
import { cn } from "@/infra/utils";

interface ScanPageHeaderProps {
  foldersCount: number;
  counts: {
    exact: number;
    queued: number;
    matching: number;
    matched: number;
    failed: number;
    paused: number;
  };
  isRescanning: boolean;
  bulkControlPending: boolean;
  onRescan: () => void;
  onPauseQueued: () => void;
  onResumePaused: () => void;
  onRetryFailed: () => void;
  onResetFailed: () => void;
  onBack: () => void;
}

export function ScanPageHeader(props: ScanPageHeaderProps) {
  return (
    <div className="sticky top-0 z-10 shrink-0 border-b bg-background">
      <div className="px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <SectionLabel className="inline-flex items-center gap-2 border border-border bg-background/80 px-3 py-1">
              <RiSparkling2Line className="h-3.5 w-3.5 text-info" />
              Library Scan
            </SectionLabel>
            <div>
              <h1 className="text-2xl font-medium tracking-tight text-foreground md:text-3xl">
                Import folders
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground md:text-base">
                Map existing folders to anime, manga, or light novels and import units.
              </p>
              <SectionLabel as="div" className="mt-1 max-w-3xl leading-5">
                Start a background pass to work through queued folders one by one. It stops
                automatically when the queue is empty.
              </SectionLabel>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <StatChip label="Unmapped" value={String(props.foldersCount)} />
            <StatChip label="Queued" value={String(props.counts.queued + props.counts.matching)} />
            <StatChip label="Paused" value={String(props.counts.paused)} />
            <StatChip label="Already in library" value={String(props.counts.exact)} tone="info" />
            <Button
              variant="outline"
              size="sm"
              isDisabled={props.isRescanning}
              onPress={props.onRescan}
            >
              <RiRefreshLine className={cn("mr-2 h-4 w-4", props.isRescanning && "animate-spin")} />
              {props.isRescanning ? "Scanning..." : "Rescan"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              isDisabled={props.bulkControlPending || props.counts.queued === 0}
              onPress={props.onPauseQueued}
            >
              <RiPauseLine className="mr-2 h-4 w-4" />
              Pause Queued
            </Button>
            <Button
              variant="outline"
              size="sm"
              isDisabled={props.bulkControlPending || props.counts.paused === 0}
              onPress={props.onResumePaused}
            >
              <RiPlayLine className="mr-2 h-4 w-4" />
              Start Paused
            </Button>
            <Button
              variant="outline"
              size="sm"
              isDisabled={props.bulkControlPending || props.counts.failed === 0}
              onPress={props.onRetryFailed}
            >
              <RiRefreshLine className="mr-2 h-4 w-4" />
              Retry Failed
            </Button>
            <Button
              variant="outline"
              size="sm"
              isDisabled={props.bulkControlPending || props.counts.failed === 0}
              onPress={props.onResetFailed}
            >
              <RiDeleteBinLine className="mr-2 h-4 w-4" />
              Reset Failed
            </Button>
            <Button variant="ghost" size="sm" onPress={props.onBack}>
              Back
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
