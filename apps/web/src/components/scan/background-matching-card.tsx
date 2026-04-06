import { createMemo, Show } from "solid-js";
import { Badge } from "~/components/ui/badge";
import { type BackgroundJobStatus } from "~/lib/api";
import {
  backgroundMatchingStatusLabel,
  backgroundMatchingStatusVariant,
} from "./background-matching-state";
import { MAX_UNMAPPED_FOLDER_MATCH_ATTEMPTS } from "@bakarr/shared";

export function BackgroundMatchingCard(props: {
  failedCount: number;
  hasOutstandingWork: boolean;
  job?: BackgroundJobStatus | undefined;
  isRunning: boolean;
  matchedCount: number;
  matchingCount: number;
  pausedCount: number;
  queuedCount: number;
  totalCount: number;
}) {
  const progressCurrent = createMemo(() => {
    const current = props.job?.progress_current;
    if (typeof current === "number") {
      return current;
    }

    return props.matchedCount;
  });
  const progressTotal = createMemo(() => {
    const total = props.job?.progress_total;
    if (typeof total === "number") {
      return total;
    }

    return props.totalCount;
  });
  const progressPercent = createMemo(() => {
    const total = progressTotal();
    if (!total) {
      return 0;
    }

    return Math.min(100, Math.round((progressCurrent() / total) * 100));
  });
  const explanation = createMemo(() => {
    if (props.matchingCount > 0) {
      return "Bakarr is trying one folder at a time, then scoring AniList candidates from cleaned folder titles, known year hints, and library overlap signals.";
    }

    if (props.failedCount > 0) {
      return "Failed folders usually need manual confirmation because title cleanup, sequel disambiguation, or existing-library conflicts kept the automatic score below the safe threshold.";
    }

    if (props.queuedCount > 0) {
      return "Queued folders will be retried with the same explanation metadata you see per folder: normalized search queries, confidence, and match reason.";
    }

    return "Finished folders keep their explanation trail so you can see why a match was chosen before importing.";
  });

  return (
    <div class="border border-border/70 bg-background/80 p-4 shadow-sm">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div class="space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-sm font-semibold text-foreground">Background folder matching</p>
            <Badge
              variant={backgroundMatchingStatusVariant({
                failedCount: props.failedCount,
                hasOutstandingWork: props.hasOutstandingWork,
                job: props.job,
                matchingCount: props.matchingCount,
                pausedCount: props.pausedCount,
              })}
            >
              {backgroundMatchingStatusLabel({
                failedCount: props.failedCount,
                hasOutstandingWork: props.hasOutstandingWork,
                job: props.job,
                matchingCount: props.matchingCount,
                pausedCount: props.pausedCount,
              })}
            </Badge>
          </div>
          <p aria-live="polite" class="text-sm text-muted-foreground">
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
          <Show when={props.job?.last_message}>
            <p class="text-xs text-muted-foreground">{props.job?.last_message}</p>
          </Show>
          <p class="text-xs text-muted-foreground">{explanation()}</p>
        </div>

        <div class="grid grid-cols-2 gap-2 text-right text-xs text-muted-foreground sm:grid-cols-4 lg:min-w-[340px]">
          <div class="border border-border/60 bg-muted/20 px-3 py-2">
            <div class="uppercase tracking-[0.18em]">Matched</div>
            <div class="mt-1 text-lg font-semibold text-foreground">{props.matchedCount}</div>
          </div>
          <div class="border border-border/60 bg-muted/20 px-3 py-2">
            <div class="uppercase tracking-[0.18em]">In queue</div>
            <div class="mt-1 text-lg font-semibold text-foreground">
              {props.queuedCount + props.matchingCount}
            </div>
          </div>
          <div class="border border-border/60 bg-muted/20 px-3 py-2">
            <div class="uppercase tracking-[0.18em]">Paused</div>
            <div class="mt-1 text-lg font-semibold text-foreground">{props.pausedCount}</div>
          </div>
          <div class="border border-border/60 bg-muted/20 px-3 py-2">
            <div class="uppercase tracking-[0.18em]">Total</div>
            <div class="mt-1 text-lg font-semibold text-foreground">{props.totalCount}</div>
          </div>
        </div>
      </div>

      <Show when={progressTotal() > 0}>
        <div class="mt-4 space-y-2">
          <div class="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Progress {progressCurrent()} / {progressTotal()}
            </span>
            <span>{progressPercent()}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={progressPercent()}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Background matching progress"
            class="h-2 overflow-hidden bg-muted"
          >
            <div
              class="h-full bg-info transition-[width] duration-500"
              style={{ width: `${progressPercent()}%` }}
            />
          </div>
        </div>
      </Show>
    </div>
  );
}
