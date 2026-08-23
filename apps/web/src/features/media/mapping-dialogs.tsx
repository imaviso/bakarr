import { useState } from "react";
import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { useBulkMapUnitsMutation, useMapUnitMutation } from "~/api/media-mutations";
import { useListFilesQuery } from "~/api/media";
import type { MediaUnit } from "~/api/contracts";
import { cn } from "~/infra/utils";

interface BulkMappingDialogProps {
  mediaId: number;
  episodes: readonly MediaUnit[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ManualMappingDialogProps {
  mediaId: number;
  unitNumber: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const UNMAP_KEY = "__unmap__";

export function BulkMappingDialog(props: BulkMappingDialogProps) {
  const filesQuery = useListFilesQuery(props.mediaId, { enabled: props.open });
  const bulkMapMutation = useBulkMapUnitsMutation();

  const [mappings, setMappings] = useState<Record<number, string>>({});

  const files = filesQuery.data || [];
  const allEpisodes = props.episodes;

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setMappings({});
    }
    props.onOpenChange(open);
  };

  const handleMap = (unitNumber: number, filePath: string | undefined) => {
    setMappings((previous) => {
      if (filePath === undefined) {
        const next = { ...previous };
        delete next[unitNumber];
        return next;
      }
      return { ...previous, [unitNumber]: filePath };
    });
  };

  const handleSubmit = () => {
    const entries = Object.entries(mappings);
    if (entries.length === 0) {
      return;
    }

    const payload = entries.map(([unitNumber, path]) => ({
      unit_number: Number.parseInt(unitNumber, 10),
      file_path: path,
    }));

    bulkMapMutation.mutate(
      {
        mediaId: props.mediaId,
        mappings: payload,
      },
      {
        onSuccess: () => {
          props.onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog
      isOpen={props.open}
      onOpenChange={handleOpenChange}
      className="sm:max-w-[800px] max-h-[90vh] w-[calc(100vw-2rem)] sm:w-full p-0 gap-0 overflow-hidden [display:flex] flex-col"
    >
      <DialogHeader className="p-4 pb-3 shrink-0 border-b border-border">
        <DialogTitle>Bulk Manual Mapping</DialogTitle>
        <DialogDescription>
          Map files to episodes manually. Showing all episodes and files.
        </DialogDescription>
      </DialogHeader>

      <div className="flex-1 min-h-0 min-w-0 w-full overflow-auto max-h-[60vh]">
        {filesQuery.data ? (
          <Table className="w-full">
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead scope="col" className="w-[90px] whitespace-nowrap">
                  MediaUnit
                </TableHead>
                <TableHead scope="col">File to Map</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allEpisodes.map((episode) => (
                <TableRow key={episode.number}>
                  <TableCell className="font-medium whitespace-nowrap align-middle">
                    Ep {episode.number}
                  </TableCell>
                  <TableCell className="min-w-0 align-middle">
                    <Select
                      selectedKey={mappings[episode.number] ?? episode.file_path ?? null}
                      onSelectionChange={(value) => {
                        const key = value === null ? undefined : String(value);
                        handleMap(episode.number, key === UNMAP_KEY ? undefined : key);
                      }}
                    >
                      <SelectTrigger className="w-full min-w-0 text-xs h-8 [&_[data-slot=select-value]]:truncate">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem id={UNMAP_KEY} textValue="(Unmap / No File)">
                            (Unmap / No File)
                          </SelectItem>
                          {files.map((file) => {
                            const itemSize = (file.size / 1024 / 1024).toFixed(1);
                            return (
                              <SelectItem
                                key={file.path}
                                id={file.path}
                                textValue={`${file.name} (${itemSize} MB)${file.unit_number !== null ? ` [Ep ${file.unit_number}]` : ""}`}
                              >
                                {file.name} ({itemSize} MB)
                                {file.unit_number !== null ? ` [Ep ${file.unit_number}]` : ""}
                              </SelectItem>
                            );
                          })}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="flex justify-center py-8">
            <ArrowClockwiseIcon className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      <DialogFooter className="p-4 pt-3 shrink-0 border-t border-border">
        <Button variant="outline" onPress={() => handleOpenChange(false)}>
          Cancel
        </Button>
        <Button
          onPress={handleSubmit}
          isDisabled={Object.keys(mappings).length === 0 || bulkMapMutation.isPending}
        >
          {bulkMapMutation.isPending ? "Mapping..." : "Save Mappings"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

export function ManualMappingDialog(props: ManualMappingDialogProps) {
  const filesQuery = useListFilesQuery(props.mediaId, { enabled: props.open });
  const mapMutation = useMapUnitMutation();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const files = filesQuery.data;

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setSelectedFile(null);
    }
    props.onOpenChange(open);
  };

  const handleSubmit = () => {
    const file = selectedFile;
    if (!file) {
      return;
    }

    mapMutation.mutate(
      {
        mediaId: props.mediaId,
        unitNumber: props.unitNumber,
        filePath: file,
      },
      {
        onSuccess: () => {
          props.onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog
      isOpen={props.open}
      onOpenChange={handleOpenChange}
      className="sm:max-w-[600px] max-h-[85vh] w-[calc(100vw-2rem)] sm:w-full p-0 gap-0 overflow-hidden [display:flex] flex-col"
    >
      <DialogHeader className="p-4 pb-3 shrink-0 border-b border-border">
        <DialogTitle>Manual Mapping - MediaUnit {props.unitNumber}</DialogTitle>
        <DialogDescription>
          Select a file from the media directory to map to this media unit.
        </DialogDescription>
      </DialogHeader>

      <div className="flex-1 min-h-0 min-w-0 w-full overflow-auto p-4 max-h-[60vh]">
        {files ? (
          <div className="border rounded-none max-h-[400px] overflow-auto w-full">
            {files.length === 0 && (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No video files found in the media directory.
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col" className="w-[30px]" />
                  <TableHead scope="col">Filename</TableHead>
                  <TableHead scope="col" className="w-[100px] text-right">
                    Size
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((file) => (
                  <TableRow
                    key={file.path}
                    className={cn(
                      "cursor-pointer hover:bg-muted focus:bg-muted focus:outline-none",
                      selectedFile === file.path && "bg-muted",
                    )}
                    onClick={() => setSelectedFile(file.path)}
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedFile(file.path);
                      }
                    }}
                  >
                    <TableCell>
                      <div
                        className={cn(
                          "h-4 w-4 rounded-full border border-primary",
                          selectedFile === file.path && "bg-primary",
                        )}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs break-all whitespace-normal max-w-[320px]">
                      {file.name}
                      {file.unit_number && (
                        <span className="ml-2 text-muted-foreground italic">
                          (Mapped to Ep {file.unit_number})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs whitespace-nowrap">
                      {(file.size / 1024 / 1024).toFixed(1)} MB
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="flex justify-center py-8">
            <ArrowClockwiseIcon className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      <DialogFooter className="p-4 pt-3 shrink-0 border-t border-border">
        <Button variant="outline" onPress={() => handleOpenChange(false)}>
          Cancel
        </Button>
        <Button onPress={handleSubmit} isDisabled={!selectedFile || mapMutation.isPending}>
          {mapMutation.isPending ? "Mapping..." : "Map File"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
