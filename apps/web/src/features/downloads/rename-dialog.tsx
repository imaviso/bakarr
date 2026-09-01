import {
  RiCheckLine,
  RiErrorWarningLine,
  RiInformationLine,
  RiLoader4Line,
} from "@remixicon/react";
import { Spinner } from "@/components/ui/spinner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DialogTitle } from "@/components/ui/dialog";
import {
  ContentDialog,
  ContentDialogBody,
  ContentDialogFooter,
  ContentDialogHeader,
} from "@/components/shared/content-dialog";
import { DialogDescription } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useExecuteRenameMutation, useRenamePreviewQuery } from "@/api/media";
import { formatNamingTitleSource, namingMetadataBadges } from "@/domain/scanned-file";

interface RenameDialogProps {
  mediaId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RenameDialog(props: RenameDialogProps) {
  const mediaId = props.mediaId;
  const previewQuery = useRenamePreviewQuery(mediaId, { enabled: props.open });
  const executeRename = useExecuteRenameMutation();
  const resetExecuteRename = executeRename.reset;

  const previewCount = previewQuery.data?.length ?? 0;

  const handleRename = () => {
    executeRename.mutate(props.mediaId);
  };

  const handleOpenChange = (open: boolean) => {
    if (open) {
      resetExecuteRename();
    }
    props.onOpenChange(open);
  };

  return (
    <ContentDialog size="lg" isOpen={props.open} onOpenChange={handleOpenChange}>
      <ContentDialogHeader>
        <DialogTitle>Rename Episodes</DialogTitle>
        <DialogDescription>
          Preview changes before applying renames. This will move/rename files according to your
          library settings.
        </DialogDescription>
      </ContentDialogHeader>

      <ContentDialogBody className="min-w-0">
        {previewQuery.isLoading ? (
          <div
            className="flex items-center justify-center h-full"
            role="status"
            aria-label="Loading preview"
          >
            <Spinner className="size-8" />
            <span className="sr-only">Loading...</span>
          </div>
        ) : (
          <>
            {previewQuery.isError && (
              <Alert variant="destructive">
                <RiErrorWarningLine className="h-4 w-4" />
                <AlertTitle>Failed to load preview</AlertTitle>
                <AlertDescription>
                  {previewQuery.error?.message ?? "An unknown error occurred."}
                </AlertDescription>
              </Alert>
            )}
            {executeRename.isError && (
              <Alert variant="destructive">
                <RiErrorWarningLine className="h-4 w-4" />
                <AlertTitle>Rename failed</AlertTitle>
                <AlertDescription>
                  {executeRename.error?.message ?? "An unknown error occurred."}
                </AlertDescription>
              </Alert>
            )}
            {executeRename.data ? (
              <div className="space-y-4" aria-live="polite">
                {(executeRename.data.failed ?? 0) > 0 && (
                  <Alert variant="destructive">
                    <RiErrorWarningLine className="h-4 w-4" />
                    <AlertTitle>Errors Occurred</AlertTitle>
                    <AlertDescription>
                      <ul className="list-disc pl-4 mt-2">
                        {(executeRename.data.failures || []).map((failure) => (
                          <li key={failure}>{failure}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <RiCheckLine className="h-16 w-16 text-success mb-4" />
                  <h3 className="text-xl font-medium">Rename Complete</h3>
                  <p className="text-muted-foreground">
                    {executeRename.data.renamed === 0
                      ? "No files needed renaming."
                      : `Successfully renamed ${executeRename.data.renamed} files.`}
                  </p>
                </div>
              </div>
            ) : (
              <>
                {!previewQuery.isError && previewQuery.data && previewQuery.data.length > 0 ? (
                  <Table aria-label="Rename preview" className="w-full">
                    <TableHeader className="sticky top-0 z-10 bg-background">
                      <TableRow>
                        <TableHead scope="col" className="w-[70px] whitespace-nowrap">
                          MediaUnit
                        </TableHead>
                        <TableHead scope="col" className="min-w-[220px]">
                          Current Filename
                        </TableHead>
                        <TableHead scope="col" className="min-w-[220px]">
                          New Filename
                        </TableHead>
                        <TableHead scope="col" className="min-w-[200px]">
                          Notes
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewQuery.data.map((item) => (
                        <TableRow key={`${item.current_path}-${item.new_filename}`}>
                          <TableCell className="align-top">{item.unit_number}</TableCell>
                          <TableCell className="font-mono text-xs break-all whitespace-normal align-top text-muted-foreground max-w-[280px]">
                            {item.current_path.split("/").pop()}
                          </TableCell>
                          <TableCell className="font-mono text-xs break-all whitespace-normal align-top text-success max-w-[280px]">
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
                                        {formatNamingTitleSource(
                                          item.metadata_snapshot.title_source,
                                        ) && (
                                          <Badge
                                            variant="secondary"
                                            className="h-5 rounded-none text-xs"
                                          >
                                            {formatNamingTitleSource(
                                              item.metadata_snapshot.title_source,
                                            )}
                                          </Badge>
                                        )}
                                        {namingMetadataBadges(item.metadata_snapshot).map(
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
                                      {item.metadata_snapshot.unit_title && (
                                        <div className="flex items-start gap-1">
                                          <RiInformationLine className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                          <span>
                                            MediaUnit title: {item.metadata_snapshot.unit_title}
                                          </span>
                                        </div>
                                      )}
                                      {item.metadata_snapshot.air_date && (
                                        <div className="flex items-start gap-1">
                                          <RiInformationLine className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                          <span>Air date: {item.metadata_snapshot.air_date}</span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {(item.warnings || []).map((warning) => (
                                    <div key={warning} className="flex items-start gap-1">
                                      <RiErrorWarningLine className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                                      <span>{warning}</span>
                                    </div>
                                  ))}
                                  {(item.missing_fields || []).map((field) => (
                                    <div key={field} className="flex items-start gap-1">
                                      <RiInformationLine className="mt-0.5 h-3.5 w-3.5 shrink-0" />
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
      </ContentDialogBody>

      <ContentDialogFooter>
        {executeRename.data ? (
          <Button onPress={() => props.onOpenChange(false)}>Close</Button>
        ) : (
          <>
            <Button variant="outline" onPress={() => props.onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onPress={handleRename}
              isDisabled={
                executeRename.isPending ||
                previewQuery.isError ||
                !previewQuery.data ||
                previewQuery.data.length === 0
              }
              aria-busy={executeRename.isPending}
            >
              {executeRename.isPending && <RiLoader4Line className="mr-2 h-4 w-4 animate-spin" />}
              {executeRename.isPending
                ? "Renaming…"
                : previewCount > 0
                  ? `Rename ${previewCount} Files`
                  : "Rename Files"}
            </Button>
          </>
        )}
      </ContentDialogFooter>
    </ContentDialog>
  );
}
