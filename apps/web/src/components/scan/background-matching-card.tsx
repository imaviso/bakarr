import { Badge } from "~/components/ui/badge";
import {
  MAX_UNMAPPED_FOLDER_MATCH_ATTEMPTS,
  type BackgroundJobStatus,
  type ScannerMatchStatus,
} from "~/lib/api";
import {
  backgroundMatchingStatusLabel,
  backgroundMatchingStatusVariant,
} from "./background-matching-state";

export function BackgroundMatchingCard(props: {
  failedCount: number;
  hasOutstandingWork: boolean;
  job?: BackgroundJobStatus | undefined;
  isRunning: boolean;
  status?: ScannerMatchStatus | undefined;
  matchedCount: number;
  matchingCount: number;
  pausedCount: number;
  queuedCount: number;
  totalCount: number;
}) {
  const progressCurrentValue = props.job?.progress_current;
  const progressTotalValue = props.job?.progress_total;
  const progressCurrent =
    typeof progressCurrentValue === "number" ? progressCurrentValue : props.matchedCount;
  const progressTotal =
    typeof progressTotalValue === "number" ? progressTotalValue : props.totalCount;

  const progressPercent = progressTotal
    ? Math.min(100, Math.round((progressCurrent / progressTotal) * 100))
    : 0;

  const explanation =
    props.matchingCount > 0
      ? "Bakarr is trying one folder at a time, then scoring AniList candidates from cleaned folder titles, known year hints, and library overlap signals."
      : props.failedCount > 0
        ? "Failed folders usually need manual confirmation because title cleanup, sequel disambiguation, or existing-library conflicts kept the automatic score below the safe threshold."
        : props.queuedCount > 0
          ? "Queued folders will be retried with the same explanation metadata you see per folder: normalized search queries, confidence, and match reason."
          : "Finished folders keep their explanation trail so you can see why a match was chosen before importing.";

  return (
    <div className="border border-border bg-background/80 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">Background folder matching</p>
            <Badge
              variant={backgroundMatchingStatusVariant({
                failedCount: props.failedCount,
                hasOutstandingWork: props.hasOutstandingWork,
                job: props.job,
                matchingCount: props.matchingCount,
                pausedCount: props.pausedCount,
                status: props.status,
              })}
            >
              {backgroundMatchingStatusLabel({
                failedCount: props.failedCount,
                hasOutstandingWork: props.hasOutstandingWork,
                job: props.job,
                matchingCount: props.matchingCount,
                pausedCount: props.pausedCount,
                status: props.status,
              })}
            </Badge>
          </div>
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {props.matchingCount > 0
              ? "Matching one folder right now to stay under AniList rate limits."
              : props.queuedCount > 0
                ? "Queued folders are ready for a background pass and will be worked through one by one."
                : props.pausedCount > 0
                  ? "Some folders are paused. Start them again individually or use Start Paused."
                  : props.failedCount > 0 && props.hasOutstandingWork
                    ? "Some folders failed their latest automatic match. They are queued to retry in the background, or you can choose a manual match now."
                    : props.failedCount > 0
                      ? `Some folders hit the ${MAX_UNMAPPED_FOLDER_MATCH_ATTEMPTS}-attempt automatic match limit. Choose a manual match to continue.`
                      : "All discovered folders have finished their latest background match pass."}
          </p>
          {props.job?.last_message && (
            <p className="text-xs text-muted-foreground">{props.job?.last_message}</p>
          )}
          <p className="text-xs text-muted-foreground">{explanation}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-right text-xs text-muted-foreground sm:grid-cols-4 lg:min-w-[340px]">
          <div className="border border-border bg-muted px-3 py-2">
            <div className="uppercase tracking-[0.18em]">Matched</div>
            <div className="mt-1 text-lg font-semibold text-foreground">{props.matchedCount}</div>
          </div>
          <div className="border border-border bg-muted px-3 py-2">
            <div className="uppercase tracking-[0.18em]">In queue</div>
            <div className="mt-1 text-lg font-semibold text-foreground">
              {props.queuedCount + props.matchingCount}
            </div>
          </div>
          <div className="border border-border bg-muted px-3 py-2">
            <div className="uppercase tracking-[0.18em]">Paused</div>
            <div className="mt-1 text-lg font-semibold text-foreground">{props.pausedCount}</div>
          </div>
          <div className="border border-border bg-muted px-3 py-2">
            <div className="uppercase tracking-[0.18em]">Total</div>
            <div className="mt-1 text-lg font-semibold text-foreground">{props.totalCount}</div>
          </div>
        </div>
      </div>

      {progressTotal > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Progress {progressCurrent} / {progressTotal}
            </span>
            <span>{progressPercent}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Background matching progress"
            className="h-2 overflow-hidden bg-muted"
          >
            <div
              className="h-full bg-info transition-[width] duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
