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
import { createEffect, createSignal, For, type JSX, Show } from "solid-js";
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
import { AddAnimeDialog } from "~/components/add-anime-dialog";
import { cn } from "~/lib/utils";
import { CandidateCard, FileRow, ManualSearch } from "./import";
import { toImportInputMode, useImportFlow } from "./import/use-import-flow";

interface ImportDialogProps {
  trigger?: JSX.Element;
  animeId?: number | undefined;
  tooltip?: string;
}

export function ImportDialog(props: ImportDialogProps) {
  const [open, setOpen] = createSignal(false);
  const {
    activeAddCandidate,
    advanceAddCandidateDialog,
    animeListQuery,
    candidates,
    closeAddCandidateDialog,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleImport,
    handleManualAdd,
    handleScan,
    importMutation,
    inputMode,
    isDragOver,
    isSearchOpen,
    libraryIds,
    manualCandidates,
    path,
    reset,
    scanMutation,
    scannedFiles,
    selectedCandidateIds,
    selectedFiles,
    setInputMode,
    setIsSearchOpen,
    setPath,
    setStep,
    skippedFiles,
    step,
    toggleCandidate,
    toggleFile,
    updateFileAnime,
    updateFileMapping,
  } = useImportFlow({
    animeId: () => props.animeId,
    beforeImport: () => {
      setOpen(false);
    },
  });

  createEffect(() => {
    if (!open()) {
      reset();
    }
  });

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
                onChange={(value) => setInputMode(toImportInputMode(value))}
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
            }}
          />
        )}
      </Show>
    </>
  );
}
