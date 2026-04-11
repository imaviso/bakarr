import { IconAlertTriangle, IconCheck, IconInfoCircle, IconLoader2 } from "@tabler/icons-solidjs";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  createExecuteRenameMutation,
  createRenamePreviewQuery,
  type RenamePreviewItem,
  type RenameResult,
} from "~/lib/api";

function formatTitleSourceLabel(
  source?: NonNullable<RenamePreviewItem["metadata_snapshot"]>["title_source"],
) {
  switch (source) {
    case "preferred_english":
      return "Preferred English";
    case "preferred_native":
      return "Preferred Native";
    case "preferred_romaji":
      return "Preferred Romaji";
    case "fallback_english":
      return "Fallback English";
    case "fallback_native":
      return "Fallback Native";
    case "fallback_romaji":
      return "Fallback Romaji";
    default:
      return undefined;
  }
}

function renamePreviewSnapshotBadges(snapshot?: RenamePreviewItem["metadata_snapshot"]) {
  if (!snapshot) {
    return [];
  }

  return [
    snapshot.source_identity?.label,
    snapshot.season !== undefined ? `Season ${snapshot.season}` : undefined,
    snapshot.year !== undefined ? String(snapshot.year) : undefined,
    snapshot.group,
    [snapshot.quality, snapshot.resolution].filter(Boolean).join(" ") || undefined,
    snapshot.video_codec,
    [snapshot.audio_codec, snapshot.audio_channels].filter(Boolean).join(" ") || undefined,
  ].filter((value): value is string => value !== undefined && value.length > 0);
}

interface RenameDialogProps {
  animeId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RenameDialog(props: RenameDialogProps) {
  const animeId = () => props.animeId;
  const previewQuery = createRenamePreviewQuery(animeId);
  const executeRename = createExecuteRenameMutation();

  const [result, setResult] = createSignal<RenameResult | null>(null);

  createEffect(() => {
    if (props.open) {
      setResult(null);
      executeRename.reset();
      void previewQuery.refetch();
    }
  });

  const previewCount = createMemo(() => previewQuery.data?.length ?? 0);

  const handleRename = () => {
    executeRename.mutate(props.animeId, {
      onSuccess: (data: RenameResult) => {
        setResult(data);
      },
    });
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class="sm:max-w-7xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Rename Episodes</DialogTitle>
          <DialogDescription>
            Preview changes before applying renames. This will move/rename files according to your
            library settings.
          </DialogDescription>
        </DialogHeader>

        <div class="flex-1 overflow-auto min-h-[300px]">
          <Show
            when={!previewQuery.isLoading}
            fallback={
              <div
                class="flex items-center justify-center h-full"
                role="status"
                aria-label="Loading preview"
              >
                <IconLoader2 class="h-8 w-8 animate-spin" />
                <span class="sr-only">Loading...</span>
              </div>
            }
          >
            <Show when={previewQuery.isError}>
              <Alert variant="destructive">
                <IconAlertTriangle class="h-4 w-4" />
                <AlertTitle>Failed to load preview</AlertTitle>
                <AlertDescription>
                  {previewQuery.error?.message ?? "An unknown error occurred."}
                </AlertDescription>
              </Alert>
            </Show>
            <Show when={executeRename.isError}>
              <Alert variant="destructive">
                <IconAlertTriangle class="h-4 w-4" />
                <AlertTitle>Rename failed</AlertTitle>
                <AlertDescription>
                  {executeRename.error?.message ?? "An unknown error occurred."}
                </AlertDescription>
              </Alert>
            </Show>
            <Show
              when={!result()}
              fallback={
                <div class="space-y-4" aria-live="polite">
                  <Show when={(result()?.failed ?? 0) > 0}>
                    <Alert variant="destructive">
                      <IconAlertTriangle class="h-4 w-4" />
                      <AlertTitle>Errors Occurred</AlertTitle>
                      <AlertDescription>
                        <ul class="list-disc pl-4 mt-2">
                          <For each={result()?.failures}>{(f) => <li>{f}</li>}</For>
                        </ul>
                      </AlertDescription>
                    </Alert>
                  </Show>
                  <div class="flex flex-col items-center justify-center py-8 text-center">
                    <IconCheck class="h-16 w-16 text-success mb-4" />
                    <h3 class="text-xl font-semibold">Rename Complete</h3>
                    <p class="text-muted-foreground">
                      {result()?.renamed === 0
                        ? "No files needed renaming."
                        : `Successfully renamed ${result()?.renamed} files.`}
                    </p>
                  </div>
                </div>
              }
            >
              <Show
                when={!previewQuery.isError && previewQuery.data && previewQuery.data.length > 0}
                fallback={
                  <Show when={!previewQuery.isError}>
                    <div class="flex items-center justify-center h-full text-muted-foreground">
                      No files need renaming.
                    </div>
                  </Show>
                }
              >
                <Table aria-label="Rename preview" class="min-w-[900px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead class="w-[80px]">Episode</TableHead>
                      <TableHead class="w-[30%]">Current Filename</TableHead>
                      <TableHead class="w-[30%]">New Filename</TableHead>
                      <TableHead class="min-w-[280px]">Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <For each={previewQuery.data}>
                      {(item) => (
                        <TableRow>
                          <TableCell>{item.episode_number}</TableCell>
                          <TableCell class="font-mono text-sm break-all text-muted-foreground">
                            {item.current_path.split("/").pop()}
                          </TableCell>
                          <TableCell class="font-mono text-sm break-all text-success dark:text-success">
                            {item.new_filename}
                          </TableCell>
                          <TableCell>
                            <div class="flex flex-col gap-1.5">
                              <div class="flex flex-wrap gap-1">
                                <Show when={item.fallback_used}>
                                  <Badge variant="outline" class="h-5 rounded-none text-xs">
                                    Fallback
                                  </Badge>
                                </Show>
                                <Show when={item.format_used}>
                                  <Badge
                                    variant="secondary"
                                    class="h-5 rounded-none text-xs font-mono"
                                  >
                                    {item.format_used}
                                  </Badge>
                                </Show>
                              </div>
                              <Show
                                when={
                                  item.warnings?.length ||
                                  item.missing_fields?.length ||
                                  item.metadata_snapshot
                                }
                              >
                                <div class="space-y-1 text-xs text-muted-foreground">
                                  <Show when={item.metadata_snapshot}>
                                    {(snapshot) => (
                                      <div class="space-y-1">
                                        <div class="flex flex-wrap gap-1">
                                          <Show
                                            when={formatTitleSourceLabel(snapshot().title_source)}
                                          >
                                            {(label) => (
                                              <Badge
                                                variant="secondary"
                                                class="h-5 rounded-none text-xs"
                                              >
                                                {label()}
                                              </Badge>
                                            )}
                                          </Show>
                                          <For each={renamePreviewSnapshotBadges(snapshot())}>
                                            {(value) => (
                                              <Badge
                                                variant="outline"
                                                class="h-5 rounded-none text-xs"
                                              >
                                                {value}
                                              </Badge>
                                            )}
                                          </For>
                                        </div>
                                        <Show when={snapshot().episode_title}>
                                          <div class="flex items-start gap-1">
                                            <IconInfoCircle class="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                            <span>Episode title: {snapshot().episode_title}</span>
                                          </div>
                                        </Show>
                                        <Show when={snapshot().air_date}>
                                          <div class="flex items-start gap-1">
                                            <IconInfoCircle class="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                            <span>Air date: {snapshot().air_date}</span>
                                          </div>
                                        </Show>
                                      </div>
                                    )}
                                  </Show>
                                  <For each={item.warnings || []}>
                                    {(warning) => (
                                      <div class="flex items-start gap-1">
                                        <IconAlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                                        <span>{warning}</span>
                                      </div>
                                    )}
                                  </For>
                                  <For each={item.missing_fields || []}>
                                    {(field) => (
                                      <div class="flex items-start gap-1">
                                        <IconInfoCircle class="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                        <span>Missing `{field}`</span>
                                      </div>
                                    )}
                                  </For>
                                </div>
                              </Show>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </For>
                  </TableBody>
                </Table>
              </Show>
            </Show>
          </Show>
        </div>

        <DialogFooter>
          <Show
            when={!result()}
            fallback={<Button onClick={() => props.onOpenChange(false)}>Close</Button>}
          >
            <Button variant="outline" onClick={() => props.onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRename}
              disabled={
                executeRename.isPending ||
                previewQuery.isError ||
                !previewQuery.data ||
                previewQuery.data.length === 0
              }
              aria-busy={executeRename.isPending}
            >
              <Show when={executeRename.isPending}>
                <IconLoader2 class="mr-2 h-4 w-4 animate-spin" />
              </Show>
              {executeRename.isPending
                ? "Renaming…"
                : previewCount() > 0
                  ? `Rename ${previewCount()} Files`
                  : "Rename Files"}
            </Button>
          </Show>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
