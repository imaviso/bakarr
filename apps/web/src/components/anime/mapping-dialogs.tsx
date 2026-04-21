import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowClockwiseIcon } from "@phosphor-icons/react";
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
  Select,
  SelectContent,
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
import {
  createBulkMapEpisodesMutation,
  createListFilesQuery,
  createMapEpisodeMutation,
  episodesQueryOptions,
} from "~/lib/api";
import { cn } from "~/lib/utils";

interface BulkMappingDialogProps {
  animeId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ManualMappingDialogProps {
  animeId: number;
  episodeNumber: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BulkMappingDialog(props: BulkMappingDialogProps) {
  const episodesQuery = useQuery(episodesQueryOptions(props.animeId));
  const filesQuery = createListFilesQuery(props.animeId);
  const bulkMapMutation = createBulkMapEpisodesMutation();

  const [mappings, setMappings] = useState<Record<number, string>>({});

  const files = filesQuery.data || [];
  const allEpisodes = episodesQuery.data || [];

  const handleMap = (episodeNumber: number, filePath: string) => {
    setMappings((previous) => {
      const next = { ...previous };
      next[episodeNumber] = filePath;
      return next;
    });
  };

  const handleSubmit = () => {
    const entries = Object.entries(mappings);
    if (entries.length === 0) {
      return;
    }

    const payload = entries.map(([episodeNumber, path]) => ({
      episode_number: Number.parseInt(episodeNumber, 10),
      file_path: path,
    }));

    bulkMapMutation.mutate(
      {
        animeId: props.animeId,
        mappings: payload,
      },
      {
        onSuccess: () => {
          props.onOpenChange(false);
          setMappings({});
        },
      },
    );
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Bulk Manual Mapping</DialogTitle>
          <DialogDescription>
            Map files to episodes manually. Showing all episodes and files.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {episodesQuery.data && filesQuery.data ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Episode</TableHead>
                  <TableHead>File to Map</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allEpisodes.map((episode) => (
                  <TableRow key={episode.number}>
                    <TableCell className="font-medium">Ep {episode.number}</TableCell>
                    <TableCell>
                      <Select
                        value={mappings[episode.number] ?? episode.file_path ?? ""}
                        onValueChange={(value) => handleMap(episode.number, value ?? "")}
                      >
                        <SelectTrigger className="w-full text-xs h-8">
                          <SelectValue placeholder="Select file..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">(Unmap / No File)</SelectItem>
                          {files.map((file) => {
                            const itemSize = (file.size / 1024 / 1024).toFixed(1);
                            return (
                              <SelectItem key={file.path} value={file.path}>
                                {file.name} ({itemSize} MB)
                                {file.episode_number !== null ? ` [Ep ${file.episode_number}]` : ""}
                              </SelectItem>
                            );
                          })}
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

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={Object.keys(mappings).length === 0 || bulkMapMutation.isPending}
          >
            {bulkMapMutation.isPending ? "Mapping..." : "Save Mappings"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ManualMappingDialog(props: ManualMappingDialogProps) {
  const filesQuery = createListFilesQuery(props.animeId);
  const mapMutation = createMapEpisodeMutation();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const handleSubmit = () => {
    const file = selectedFile;
    if (!file) {
      return;
    }

    mapMutation.mutate(
      {
        animeId: props.animeId,
        episodeNumber: props.episodeNumber,
        filePath: file,
      },
      {
        onSuccess: () => {
          props.onOpenChange(false);
          setSelectedFile(null);
        },
      },
    );
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Manual Mapping - Episode {props.episodeNumber}</DialogTitle>
          <DialogDescription>
            Select a file from the anime directory to map to this episode.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {filesQuery.data ? (
            (() => {
              const files = filesQuery.data;
              return (
                <div className="border rounded-none max-h-[300px] overflow-y-auto">
                  {files.length === 0 && (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      No video files found in the anime directory.
                    </div>
                  )}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[30px]" />
                        <TableHead>Filename</TableHead>
                        <TableHead className="w-[100px] text-right">Size</TableHead>
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
                          <TableCell className="font-mono text-xs break-all">
                            {file.name}
                            {file.episode_number && (
                              <span className="ml-2 text-muted-foreground italic">
                                (Mapped to Ep {file.episode_number})
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            {(file.size / 1024 / 1024).toFixed(1)} MB
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              );
            })()
          ) : (
            <div className="flex justify-center py-8">
              <ArrowClockwiseIcon className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!selectedFile || mapMutation.isPending}>
            {mapMutation.isPending ? "Mapping..." : "Map File"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
