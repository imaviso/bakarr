import { useQuery } from "@tanstack/solid-query";
import { createSignal, For, Show } from "solid-js";
import { toast } from "solid-sonner";
import { IconRefresh } from "@tabler/icons-solidjs";
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
  type VideoFile,
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
  const episodesQuery = useQuery(() => episodesQueryOptions(props.animeId));
  const filesQuery = createListFilesQuery(() => props.animeId);
  const bulkMapMutation = createBulkMapEpisodesMutation();

  const [mappings, setMappings] = createSignal<Record<number, string>>({});

  const files = () => filesQuery.data || [];
  const allEpisodes = () => episodesQuery.data || [];

  type MappingOption = { path: string; name: string } | VideoFile;

  const handleMap = (episodeNumber: number, filePath: string) => {
    setMappings((previous) => {
      const next = { ...previous };
      next[episodeNumber] = filePath;
      return next;
    });
  };

  const handleSubmit = () => {
    const entries = Object.entries(mappings());
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
          toast.success(`Successfully mapped ${entries.length} episodes`);
          props.onOpenChange(false);
          setMappings({});
        },
        onError: (error: Error) => {
          toast.error(`Failed to map episodes: ${error.message}`);
        },
      },
    );
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class="sm:max-w-[800px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Bulk Manual Mapping</DialogTitle>
          <DialogDescription>
            Map files to episodes manually. Showing all episodes and files.
          </DialogDescription>
        </DialogHeader>

        <div class="flex-1 overflow-y-auto py-4">
          <Show
            when={episodesQuery.data && filesQuery.data}
            fallback={
              <div class="flex justify-center py-8">
                <IconRefresh class="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead class="w-[80px]">Episode</TableHead>
                  <TableHead>File to Map</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <For each={allEpisodes()}>
                  {(episode) => (
                    <TableRow>
                      <TableCell class="font-medium">Ep {episode.number}</TableCell>
                      <TableCell>
                        <Select
                          options={[{ path: "", name: "(Unmap / No File)" }, ...(files() || [])]}
                          optionValue="path"
                          optionTextValue="name"
                          value={
                            files().find(
                              (file) =>
                                file.path === (mappings()[episode.number] ?? episode.file_path),
                            ) || { path: "", name: "(Unmap / No File)" }
                          }
                          onChange={(value) => handleMap(episode.number, value?.path || "")}
                          placeholder="Select file..."
                          itemComponent={(itemProps) => {
                            const item: MappingOption = itemProps.item.rawValue;
                            const itemSize =
                              "size" in item ? (item.size / 1024 / 1024).toFixed(1) : null;
                            const itemEpisode =
                              "episode_number" in item ? item.episode_number : null;
                            return (
                              <SelectItem item={itemProps.item}>
                                {item.name}
                                <Show when={itemSize}>
                                  {" ("}
                                  {itemSize} MB)
                                </Show>
                                <Show when={itemEpisode !== null}>{` [Ep ${itemEpisode}]`}</Show>
                              </SelectItem>
                            );
                          }}
                        >
                          <SelectTrigger class="w-full text-xs h-8">
                            <SelectValue<MappingOption>>
                              {(state) => state.selectedOption()?.name}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent />
                        </Select>
                      </TableCell>
                    </TableRow>
                  )}
                </For>
              </TableBody>
            </Table>
          </Show>
        </div>

        <DialogFooter class="mt-4">
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={Object.keys(mappings()).length === 0 || bulkMapMutation.isPending}
          >
            {bulkMapMutation.isPending ? "Mapping..." : "Save Mappings"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ManualMappingDialog(props: ManualMappingDialogProps) {
  const filesQuery = createListFilesQuery(() => props.animeId);
  const mapMutation = createMapEpisodeMutation();
  const [selectedFile, setSelectedFile] = createSignal<string | null>(null);

  const handleSubmit = () => {
    const file = selectedFile();
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
          toast.success("Episode mapped successfully");
          props.onOpenChange(false);
          setSelectedFile(null);
        },
        onError: (error) => {
          toast.error(`Failed to map episode: ${error.message}`);
        },
      },
    );
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Manual Mapping - Episode {props.episodeNumber}</DialogTitle>
          <DialogDescription>
            Select a file from the anime directory to map to this episode.
          </DialogDescription>
        </DialogHeader>

        <div class="py-4">
          <Show
            when={filesQuery.data}
            fallback={
              <div class="flex justify-center py-8">
                <IconRefresh class="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            }
          >
            {(files) => (
              <div class="border rounded-md max-h-[300px] overflow-y-auto">
                <Show when={files().length === 0}>
                  <div class="p-4 text-center text-sm text-muted-foreground">
                    No video files found in the anime directory.
                  </div>
                </Show>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead class="w-[30px]" />
                      <TableHead>Filename</TableHead>
                      <TableHead class="w-[100px] text-right">Size</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <For each={files()}>
                      {(file) => (
                        <TableRow
                          class={cn(
                            "cursor-pointer hover:bg-muted/50 focus:bg-muted focus:outline-none",
                            selectedFile() === file.path && "bg-muted",
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
                              class={cn(
                                "h-4 w-4 rounded-full border border-primary",
                                selectedFile() === file.path && "bg-primary",
                              )}
                            />
                          </TableCell>
                          <TableCell class="font-mono text-xs break-all">
                            {file.name}
                            <Show when={file.episode_number}>
                              <span class="ml-2 text-muted-foreground italic">
                                (Mapped to Ep {file.episode_number})
                              </span>
                            </Show>
                          </TableCell>
                          <TableCell class="text-right text-xs">
                            {(file.size / 1024 / 1024).toFixed(1)} MB
                          </TableCell>
                        </TableRow>
                      )}
                    </For>
                  </TableBody>
                </Table>
              </div>
            )}
          </Show>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!selectedFile() || mapMutation.isPending}>
            {mapMutation.isPending ? "Mapping..." : "Map File"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
