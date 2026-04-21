import { WarningIcon, CheckIcon, InfoIcon, SpinnerIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
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
  const animeId = props.animeId;
  const previewQuery = createRenamePreviewQuery(animeId);
  const executeRename = createExecuteRenameMutation();

  const [result, setResult] = useState<RenameResult | null>(null);

  useEffect(() => {
    if (props.open) {
      setResult(null);
      executeRename.reset();
      void previewQuery.refetch();
    }
  }, [props.open, executeRename, previewQuery]);

  const previewCount = useMemo(() => previewQuery.data?.length ?? 0, [previewQuery.data]);

  const handleRename = () => {
    executeRename.mutate(props.animeId, {
      onSuccess: (data: RenameResult) => {
        setResult(data);
      },
    });
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-7xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Rename Episodes</DialogTitle>
          <DialogDescription>
            Preview changes before applying renames. This will move/rename files according to your
            library settings.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto min-h-[300px]">
          {previewQuery.isLoading ? (
            <div
              className="flex items-center justify-center h-full"
              role="status"
              aria-label="Loading preview"
            >
              <SpinnerIcon className="h-8 w-8 animate-spin" />
              <span className="sr-only">Loading...</span>
            </div>
          ) : (
            <>
              {previewQuery.isError && (
                <Alert variant="destructive">
                  <WarningIcon className="h-4 w-4" />
                  <AlertTitle>Failed to load preview</AlertTitle>
                  <AlertDescription>
                    {previewQuery.error?.message ?? "An unknown error occurred."}
                  </AlertDescription>
                </Alert>
              )}
              {executeRename.isError && (
                <Alert variant="destructive">
                  <WarningIcon className="h-4 w-4" />
                  <AlertTitle>Rename failed</AlertTitle>
                  <AlertDescription>
                    {executeRename.error?.message ?? "An unknown error occurred."}
                  </AlertDescription>
                </Alert>
              )}
              {result ? (
                <div className="space-y-4" aria-live="polite">
                  {(result.failed ?? 0) > 0 && (
                    <Alert variant="destructive">
                      <WarningIcon className="h-4 w-4" />
                      <AlertTitle>Errors Occurred</AlertTitle>
                      <AlertDescription>
                        <ul className="list-disc pl-4 mt-2">
                          {(result.failures || []).map((failure) => (
                            <li key={failure}>{failure}</li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <CheckIcon className="h-16 w-16 text-success mb-4" />
                    <h3 className="text-xl font-semibold">Rename Complete</h3>
                    <p className="text-muted-foreground">
                      {result.renamed === 0
                        ? "No files needed renaming."
                        : `Successfully renamed ${result.renamed} files.`}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {!previewQuery.isError && previewQuery.data && previewQuery.data.length > 0 ? (
                    <Table aria-label="Rename preview" className="min-w-[900px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[80px]">Episode</TableHead>
                          <TableHead className="w-[30%]">Current Filename</TableHead>
                          <TableHead className="w-[30%]">New Filename</TableHead>
                          <TableHead className="min-w-[280px]">Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewQuery.data.map((item) => (
                          <TableRow key={`${item.current_path}-${item.new_filename}`}>
                            <TableCell>{item.episode_number}</TableCell>
                            <TableCell className="font-mono text-sm break-all text-muted-foreground">
                              {item.current_path.split("/").pop()}
                            </TableCell>
                            <TableCell className="font-mono text-sm break-all text-success dark:text-success">
                              {item.new_filename}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1.5">
                                <div className="flex flex-wrap gap-1">
                                  {item.fallback_used && (
                                    <Badge variant="outline" className="h-5 rounded-none text-xs">
                                      Fallback
                                    </Badge>
                                  )}
                                  {item.format_used && (
                                    <Badge
                                      variant="secondary"
                                      className="h-5 rounded-none text-xs font-mono"
                                    >
                                      {item.format_used}
                                    </Badge>
                                  )}
                                </div>
                                {(item.warnings?.length ||
                                  item.missing_fields?.length ||
                                  item.metadata_snapshot) && (
                                  <div className="space-y-1 text-xs text-muted-foreground">
                                    {item.metadata_snapshot && (
                                      <div className="space-y-1">
                                        <div className="flex flex-wrap gap-1">
                                          {formatTitleSourceLabel(
                                            item.metadata_snapshot.title_source,
                                          ) && (
                                            <Badge
                                              variant="secondary"
                                              className="h-5 rounded-none text-xs"
                                            >
                                              {formatTitleSourceLabel(
                                                item.metadata_snapshot.title_source,
                                              )}
                                            </Badge>
                                          )}
                                          {renamePreviewSnapshotBadges(item.metadata_snapshot).map(
                                            (value) => (
                                              <Badge
                                                key={value}
                                                variant="outline"
                                                className="h-5 rounded-none text-xs"
                                              >
                                                {value}
                                              </Badge>
                                            ),
                                          )}
                                        </div>
                                        {item.metadata_snapshot.episode_title && (
                                          <div className="flex items-start gap-1">
                                            <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                            <span>
                                              Episode title: {item.metadata_snapshot.episode_title}
                                            </span>
                                          </div>
                                        )}
                                        {item.metadata_snapshot.air_date && (
                                          <div className="flex items-start gap-1">
                                            <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                            <span>Air date: {item.metadata_snapshot.air_date}</span>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    {(item.warnings || []).map((warning) => (
                                      <div key={warning} className="flex items-start gap-1">
                                        <WarningIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                                        <span>{warning}</span>
                                      </div>
                                    ))}
                                    {(item.missing_fields || []).map((field) => (
                                      <div key={field} className="flex items-start gap-1">
                                        <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                        <span>Missing `{field}`</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    !previewQuery.isError && (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        No files need renaming.
                      </div>
                    )
                  )}
                </>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          {result ? (
            <Button onClick={() => props.onOpenChange(false)}>Close</Button>
          ) : (
            <>
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
                {executeRename.isPending && <SpinnerIcon className="mr-2 h-4 w-4 animate-spin" />}
                {executeRename.isPending
                  ? "Renaming…"
                  : previewCount > 0
                    ? `Rename ${previewCount} Files`
                    : "Rename Files"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
