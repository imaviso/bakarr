import {
  IconArrowRight,
  IconFile,
  IconFolderOpen,
  IconListTree,
  IconLoader2,
  IconPlus,
  IconSearch,
  IconTypography,
  IconUpload,
  IconX,
} from "@tabler/icons-solidjs";
import { createEffect, createMemo, createSignal, For, type JSX, Show } from "solid-js";
import { toast } from "solid-sonner";
import { FileBrowser } from "~/components/file-browser";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { TextField, TextFieldInput, TextFieldLabel } from "~/components/ui/text-field";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import {
  type AnimeSearchResult,
  createAnimeListQuery,
  createImportFilesMutation,
  createScanImportPathMutation,
  type ImportFileRequest,
  type ScannedFile,
} from "~/lib/api";
import { AddAnimeDialog } from "~/components/add-anime-dialog";
import { summarizeImportNamingOutcome } from "~/lib/scanned-file";
import { cn } from "~/lib/utils";
import { CandidateCard, FileRow, ManualSearch } from "./import";
import {
  buildImportFileRequest,
  findMissingImportCandidates,
  toggleImportCandidateSelection,
} from "./import/import-flow";

interface ImportDialogProps {
  trigger?: JSX.Element;
  animeId?: number | undefined;
  tooltip?: string;
}

function getDroppedFilePath(file: File): string | undefined {
  if (!Object.hasOwn(file, "path")) {
    return undefined;
  }

  const value = Reflect.get(file, "path");
  return typeof value === "string" ? value : undefined;
}

function toInputMode(value: string | null | undefined): "browser" | "manual" {
  return value === "manual" ? "manual" : "browser";
}

export function ImportDialog(props: ImportDialogProps) {
  const [open, setOpen] = createSignal(false);
  const [path, setPath] = createSignal("");
  const [step, setStep] = createSignal<"scan" | "review" | "result">("scan");
  const [selectedFiles, setSelectedFiles] = createSignal<Map<string, ImportFileRequest>>(new Map());
  const [inputMode, setInputMode] = createSignal<"browser" | "manual">("browser");
  const [isDragOver, setIsDragOver] = createSignal(false);

  const [selectedCandidateIds, setSelectedCandidateIds] = createSignal<Set<number>>(new Set());
  const [manualCandidates, setManualCandidates] = createSignal<AnimeSearchResult[]>([]);
  const [isSearchOpen, setIsSearchOpen] = createSignal(false);
  const [pendingAddCandidates, setPendingAddCandidates] = createSignal<AnimeSearchResult[]>([]);
  const [currentAddIndex, setCurrentAddIndex] = createSignal(0);

  const scanMutation = createScanImportPathMutation();
  const importMutation = createImportFilesMutation();
  const animeListQuery = createAnimeListQuery();

  const scannedFiles = createMemo(() => {
    const files = scanMutation.data?.files || [];
    return [...files].toSorted((a, b) => {
      const seasonA = a.season || 0;
      const seasonB = b.season || 0;
      if (seasonA !== seasonB) return seasonA - seasonB;
      return a.episode_number - b.episode_number;
    });
  });

  const skippedFiles = createMemo(() => scanMutation.data?.skipped || []);

  const candidates = createMemo(() => [
    ...(scanMutation.data?.candidates || []),
    ...manualCandidates().filter(
      (mc) => !scanMutation.data?.candidates.some((c) => c.id === mc.id),
    ),
  ]);
  const libraryIds = createMemo(
    () => new Set((animeListQuery.data ?? []).map((anime) => anime.id)),
  );

  const resetDialog = () => {
    setStep("scan");
    setPath("");
    setSelectedFiles(new Map());
    setSelectedCandidateIds(new Set<number>());
    setManualCandidates([]);
  };

  createEffect(() => {
    if (!open()) {
      resetDialog();
    }
  });

  const handleManualAdd = (candidate: AnimeSearchResult) => {
    setManualCandidates((prev) => [...prev, candidate]);
    setIsSearchOpen(false);
    toggleCandidate(candidate, true);
  };

  const handleScan = () => {
    const animeId = props.animeId;
    scanMutation.mutate(
      {
        path: path(),
        ...(animeId === undefined ? {} : { anime_id: animeId }),
      },
      {
        onSuccess: (data) => {
          const preselected = new Map<string, ImportFileRequest>();
          const newSelectedCandidates = new Set<number>();

          data.files.forEach((file) => {
            if (file.matched_anime) {
              preselected.set(
                file.source_path,
                buildImportFileRequest({
                  animeId: file.matched_anime.id,
                  file,
                }),
              );
            } else if (file.suggested_candidate_id) {
              preselected.set(
                file.source_path,
                buildImportFileRequest({
                  animeId: file.suggested_candidate_id,
                  file,
                }),
              );
              newSelectedCandidates.add(file.suggested_candidate_id);
            }
          });
          setSelectedFiles(preselected);
          setSelectedCandidateIds(newSelectedCandidates);
          setStep("review");
        },
      },
    );
  };

  const toggleCandidate = (candidate: AnimeSearchResult, forceSelect = false) => {
    const next = toggleImportCandidateSelection({
      candidate,
      files: scanMutation.data?.files || [],
      forceSelect,
      selectedCandidateIds: selectedCandidateIds(),
      selectedFiles: selectedFiles(),
    });

    setSelectedCandidateIds(next.selectedCandidateIds);
    setSelectedFiles(next.selectedFiles);
  };

  const activeAddCandidate = createMemo(() => pendingAddCandidates()[currentAddIndex()]);

  const closeAddCandidateDialog = () => {
    setPendingAddCandidates([]);
    setCurrentAddIndex(0);
  };

  const advanceAddCandidateDialog = () => {
    if (currentAddIndex() + 1 >= pendingAddCandidates().length) {
      closeAddCandidateDialog();
      return;
    }

    setCurrentAddIndex((index) => index + 1);
  };

  const handleImport = () => {
    const files = Array.from(selectedFiles().values());

    const missingCandidates = findMissingImportCandidates({
      files,
      localAnimeIds: new Set(animeListQuery.data?.map((a) => a.id) || []),
      candidates: candidates(),
    });

    if (missingCandidates.length > 0) {
      setPendingAddCandidates(missingCandidates);
      setCurrentAddIndex(0);
      return;
    }

    setOpen(false);

    const toastId = toast.loading(`Importing ${files.length} file(s)...`);
    importMutation
      .mutateAsync(files)
      .then((data) => {
        const imported = data?.imported || 0;
        const failed = data?.failed || 0;
        const namingDetail = summarizeImportNamingOutcome(data?.imported_files);
        if (failed > 0) {
          toast.warning(
            namingDetail
              ? `Imported ${imported} file(s), ${failed} failed. ${namingDetail}.`
              : `Imported ${imported} file(s), ${failed} failed`,
            {
              id: toastId,
            },
          );
        } else {
          toast.success(
            namingDetail
              ? `Successfully imported ${imported} file(s). ${namingDetail}.`
              : `Successfully imported ${imported} file(s)`,
            {
              id: toastId,
            },
          );
        }
      })
      .catch((err) => {
        toast.error(`Import failed: ${err.message}`, { id: toastId });
      });
  };

  const toggleFile = (file: ScannedFile, targetAnimeId: number) => {
    const newSelected = new Map(selectedFiles());
    if (newSelected.has(file.source_path)) {
      newSelected.delete(file.source_path);
    } else {
      newSelected.set(file.source_path, buildImportFileRequest({ animeId: targetAnimeId, file }));
    }
    setSelectedFiles(newSelected);
  };

  const updateFileAnime = (file: ScannedFile, newAnimeId: number) => {
    const newSelected = new Map(selectedFiles());
    if (newSelected.has(file.source_path)) {
      const existing = newSelected.get(file.source_path);
      if (existing) {
        newSelected.set(
          file.source_path,
          buildImportFileRequest({
            animeId: newAnimeId,
            episodeNumber: existing.episode_number,
            ...(existing.episode_numbers === undefined
              ? {}
              : { episodeNumbers: existing.episode_numbers }),
            file,
            ...(existing.season === undefined ? {} : { season: existing.season }),
            ...(existing.source_metadata === undefined
              ? {}
              : { sourceMetadata: existing.source_metadata }),
          }),
        );
      }
      setSelectedFiles(newSelected);
    }
  };

  const updateFileMapping = (file: ScannedFile, season: number, episode: number) => {
    const newSelected = new Map(selectedFiles());
    const current = newSelected.get(file.source_path) || {
      ...buildImportFileRequest({
        animeId: file.matched_anime?.id || 0,
        file,
      }),
    };

    newSelected.set(
      file.source_path,
      buildImportFileRequest({
        animeId: current.anime_id,
        episodeNumber: episode,
        ...(current.episode_numbers === undefined
          ? {}
          : { episodeNumbers: current.episode_numbers }),
        file,
        season,
        ...(current.source_metadata === undefined
          ? {}
          : { sourceMetadata: current.source_metadata }),
      }),
    );
    setSelectedFiles(newSelected);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };
  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };
  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const items = e.dataTransfer?.items;
    if (items && items.length > 0) {
      const item = items[0];
      if (!item) {
        return;
      }
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) {
          const droppedPath = getDroppedFilePath(file);
          if (droppedPath) {
            setPath(droppedPath);
            setInputMode("manual");
          }
        }
      }
    }
    const textData = e.dataTransfer?.getData("text/plain");
    if (textData && (textData.startsWith("/") || textData.startsWith("file://"))) {
      setPath(textData.replace("file://", ""));
      setInputMode("manual");
    }
  };

  return (
    <>
      <Dialog open={open()} onOpenChange={setOpen}>
        <DialogTrigger as="div" class="contents">
          <Show
            when={props.tooltip}
            fallback={
              props.trigger || (
                <Button variant="outline">
                  <IconFolderOpen class="mr-2 h-4 w-4" />
                  Import Files
                </Button>
              )
            }
          >
            <Tooltip>
              <TooltipTrigger>
                {props.trigger || (
                  <Button variant="outline">
                    <IconFolderOpen class="mr-2 h-4 w-4" />
                    Import Files
                  </Button>
                )}
              </TooltipTrigger>
              <TooltipContent>{props.tooltip}</TooltipContent>
            </Tooltip>
          </Show>
        </DialogTrigger>

        <DialogContent class="max-w-6xl w-full max-h-[85vh] flex flex-col overflow-hidden">
          <Show when={step() === "scan"}>
            <DialogHeader>
              <DialogTitle>Import Video Files</DialogTitle>
              <DialogDescription>
                Select a folder containing video files to import into your library.
              </DialogDescription>
            </DialogHeader>
            <div class="space-y-4 py-4 flex-1 min-h-0 flex flex-col">
              <Tabs
                value={inputMode()}
                onChange={(value) => setInputMode(toInputMode(value))}
                class="flex-1 flex flex-col min-h-0"
              >
                <TabsList class="grid w-full grid-cols-2">
                  <TabsTrigger value="browser">
                    <IconListTree class="mr-2 h-4 w-4" />
                    Browse
                  </TabsTrigger>
                  <TabsTrigger value="manual">
                    <IconTypography class="mr-2 h-4 w-4" />
                    Manual Path
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="browser" class="mt-4 flex-1 min-h-0">
                  <div class="h-[280px] border rounded-none overflow-hidden bg-background">
                    <FileBrowser onSelect={(p) => setPath(p)} directoryOnly height="100%" />
                  </div>
                </TabsContent>
                <TabsContent value="manual" class="mt-4 flex-1">
                  <div
                    class={cn(
                      "border-2 border-dashed rounded-none p-6 transition-colors h-full flex flex-col items-center justify-center",
                      isDragOver() ? "border-primary bg-primary/5" : "border-muted-foreground/25",
                    )}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    <div class="flex flex-col items-center gap-4">
                      <div class="rounded-none bg-muted p-3">
                        <IconUpload class="h-6 w-6 text-muted-foreground" />
                      </div>
                      <div class="text-center">
                        <p class="text-sm font-medium">Drag and drop a folder here</p>
                        <p class="text-xs text-muted-foreground mt-1">or enter path below</p>
                      </div>
                      <div class="w-full space-y-2">
                        <TextField value={path()} onChange={setPath}>
                          <TextFieldLabel>Folder Path</TextFieldLabel>
                          <TextFieldInput placeholder="/path/to/videos" class="font-mono text-sm" />
                        </TextField>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              <Show when={path()}>
                <div class="flex items-center gap-2 p-3 rounded-none bg-muted/50 border">
                  <IconFolderOpen class="h-4 w-4 text-muted-foreground shrink-0" />
                  <span class="text-sm font-mono truncate flex-1">{path()}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setPath("")}
                    class="shrink-0"
                    aria-label="Clear path"
                  >
                    <IconX class="h-3 w-3" />
                  </Button>
                </div>
              </Show>
            </div>
            <DialogFooter>
              <Button onClick={handleScan} disabled={!path() || scanMutation.isPending}>
                <Show
                  when={scanMutation.isPending}
                  fallback={
                    <>
                      <IconSearch class="mr-2 h-4 w-4" />
                      Scan Folder
                    </>
                  }
                >
                  <IconLoader2 class="mr-2 h-4 w-4 animate-spin" />
                  Scanning...
                </Show>
              </Button>
            </DialogFooter>
          </Show>

          <Show when={step() === "review"}>
            <DialogHeader>
              <DialogTitle>Review Files</DialogTitle>
              <DialogDescription>
                Found {scannedFiles().length} file(s). Select files to import.
                <Show when={skippedFiles().length > 0}>
                  <span class="text-warning"> ({skippedFiles().length} skipped)</span>
                </Show>
              </DialogDescription>
            </DialogHeader>

            <div class="flex-1 min-h-0 overflow-y-auto px-1">
              {/* Candidates */}
              <div class="bg-muted/30 p-4 rounded-none border mb-4">
                <div class="flex items-center justify-between mb-3">
                  <h4 class="text-sm font-medium flex items-center gap-2">
                    <IconListTree class="h-4 w-4 text-primary" />
                    Suggested Series
                  </h4>
                  <Dialog open={isSearchOpen()} onOpenChange={setIsSearchOpen}>
                    <DialogTrigger
                      as={Button}
                      variant="outline"
                      size="sm"
                      class="h-7 text-xs gap-1.5"
                    >
                      <IconPlus class="h-3.5 w-3.5" />
                      Add Series
                    </DialogTrigger>
                    <DialogContent class="sm:max-w-[500px]">
                      <DialogHeader>
                        <DialogTitle>Search Anime</DialogTitle>
                      </DialogHeader>
                      <div class="py-4">
                        <ManualSearch
                          onSelect={handleManualAdd}
                          existingIds={new Set(candidates().map((c) => c.id))}
                        />
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  <For each={candidates()}>
                    {(candidate) => (
                      <CandidateCard
                        candidate={candidate}
                        libraryIds={libraryIds()}
                        isSelected={selectedCandidateIds().has(candidate.id)}
                        isLocal={animeListQuery.data?.some((a) => a.id === candidate.id) || false}
                        isManual={manualCandidates().some((c) => c.id === candidate.id)}
                        onToggle={() => toggleCandidate(candidate)}
                      />
                    )}
                  </For>
                </div>
              </div>

              {/* File List */}
              <ul class="divide-y border rounded-none" aria-label="Scanned files for import">
                <For each={scannedFiles()}>
                  {(file) => (
                    <FileRow
                      file={file}
                      animeList={animeListQuery.data || []}
                      candidates={candidates()}
                      isSelected={selectedFiles().has(file.source_path)}
                      selectedAnimeId={selectedFiles().get(file.source_path)?.anime_id}
                      currentEpisode={selectedFiles().get(file.source_path)?.episode_number}
                      currentSeason={selectedFiles().get(file.source_path)?.season ?? null}
                      onToggle={(id) => toggleFile(file, id)}
                      onAnimeChange={(id) => updateFileAnime(file, id)}
                      onMappingChange={(s, e) => updateFileMapping(file, s, e)}
                    />
                  )}
                </For>
              </ul>

              {/* Skipped Files */}
              <Show when={skippedFiles().length > 0}>
                <details class="mt-4 border rounded-none">
                  <summary class="px-4 py-2 text-sm text-muted-foreground cursor-pointer hover:bg-muted/50">
                    {skippedFiles().length} skipped file(s)
                  </summary>
                  <div class="divide-y border-t">
                    <For each={skippedFiles()}>
                      {(file) => (
                        <div class="px-4 py-2 flex items-center gap-3 text-muted-foreground">
                          <IconFile class="h-4 w-4 shrink-0 opacity-50" />
                          <span class="text-xs font-mono truncate flex-1">
                            {file.path.substring(file.path.lastIndexOf("/") + 1)}
                          </span>
                          <Badge variant="secondary" class="text-xs shrink-0">
                            {file.reason}
                          </Badge>
                        </div>
                      )}
                    </For>
                  </div>
                </details>
              </Show>
            </div>

            <DialogFooter class="flex-row justify-between sm:justify-between">
              <Button variant="outline" onClick={() => setStep("scan")}>
                Back
              </Button>
              <div class="flex items-center gap-2">
                <span class="text-sm text-muted-foreground">{selectedFiles().size} selected</span>
                <Button
                  onClick={handleImport}
                  disabled={selectedFiles().size === 0 || importMutation.isPending}
                >
                  <Show
                    when={importMutation.isPending}
                    fallback={
                      <>
                        <IconArrowRight class="mr-2 h-4 w-4" />
                        Import Selected
                      </>
                    }
                  >
                    <IconLoader2 class="mr-2 h-4 w-4 animate-spin" />
                    Importing...
                  </Show>
                </Button>
              </div>
            </DialogFooter>
          </Show>
        </DialogContent>
      </Dialog>

      <Show when={activeAddCandidate()}>
        {(candidate) => (
          <AddAnimeDialog
            anime={candidate()}
            open
            onOpenChange={(nextOpen) => {
              if (!nextOpen) {
                closeAddCandidateDialog();
              }
            }}
            onSuccess={() => {
              advanceAddCandidateDialog();
              queueMicrotask(() => {
                if (pendingAddCandidates().length === 0) {
                  handleImport();
                }
              });
            }}
          />
        )}
      </Show>
    </>
  );
}
