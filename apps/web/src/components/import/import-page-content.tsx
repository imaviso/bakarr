import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
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
import { Link } from "@tanstack/solid-router";
import { For, Show, Suspense } from "solid-js";
import { AddAnimeDialog } from "~/components/add-anime-dialog";
import { FileBrowser } from "~/components/file-browser";
import { CandidateCard, FileRow, ManualSearch } from "~/components/import";
import { importSteps, type ImportPageState } from "~/components/import/import-page-state";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { TextField, TextFieldInput, TextFieldLabel } from "~/components/ui/text-field";
import { cn } from "~/lib/utils";

const DEFAULT_ANIME_SEARCH = {
  filter: "all",
  q: "",
  view: "grid",
} as const;

interface ImportPageContentProps {
  state: ImportPageState;
}

export function ImportPageContent(props: ImportPageContentProps) {
  return (
    <>
      <div class="h-[calc(100vh-8rem)] flex flex-col overflow-hidden">
        <ImportTopBar state={props.state} />

        <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
          <Show when={props.state.flow.step() === "scan"}>
            <ImportScanStep state={props.state} />
          </Show>

          <Show when={props.state.flow.step() === "review"}>
            <ImportReviewStep state={props.state} />
          </Show>
        </div>
      </div>

      <Show when={props.state.flow.activeAddCandidate()}>
        {(candidate) => (
          <AddAnimeDialog
            anime={candidate()}
            open
            onOpenChange={(nextOpen) => {
              if (!nextOpen) {
                props.state.flow.closeAddCandidateDialog();
              }
            }}
            onSuccess={props.state.flow.advanceAddCandidateDialog}
          />
        )}
      </Show>
    </>
  );
}

function ImportTopBar(props: { state: ImportPageState }) {
  return (
    <div class="shrink-0 border-b bg-muted/30 px-6 py-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          <Link to="/anime" search={DEFAULT_ANIME_SEARCH}>
            <Button
              variant="ghost"
              size="icon"
              class="relative after:absolute after:-inset-2 h-8 w-8"
            >
              <IconArrowLeft class="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 class="text-xl font-semibold tracking-tight text-foreground">Import Files</h1>
            <Show when={props.state.flow.step() === "review" && props.state.flow.path()}>
              <div class="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                <IconFolderOpen class="h-3 w-3" />
                <span class="font-mono truncate max-w-md">{props.state.flow.path()}</span>
              </div>
            </Show>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <For each={importSteps}>
            {(stepConfig, index) => (
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (index() < props.state.currentStepIndex()) {
                      props.state.flow.setStep(stepConfig.id);
                    }
                  }}
                  disabled={index() > props.state.currentStepIndex()}
                  class={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                    props.state.flow.step() === stepConfig.id
                      ? "bg-primary text-primary-foreground"
                      : index() < props.state.currentStepIndex()
                        ? "text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                        : "text-muted-foreground/50 cursor-not-allowed",
                  )}
                >
                  <span
                    class={cn(
                      "flex items-center justify-center h-5 w-5 rounded-full text-xs",
                      props.state.flow.step() === stepConfig.id
                        ? "bg-primary-foreground/20"
                        : index() < props.state.currentStepIndex()
                          ? "bg-success/20 text-success"
                          : "bg-muted-foreground/10",
                    )}
                  >
                    <Show when={index() < props.state.currentStepIndex()} fallback={index() + 1}>
                      <IconCheck class="h-3 w-3" />
                    </Show>
                  </span>
                  {stepConfig.label}
                </button>
                <Show when={index() < importSteps.length - 1}>
                  <div
                    class={cn(
                      "h-px w-6",
                      index() < props.state.currentStepIndex() ? "bg-primary" : "bg-border",
                    )}
                  />
                </Show>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}

function ImportScanStep(props: { state: ImportPageState }) {
  return (
    <div class="h-full flex flex-col overflow-hidden">
      <div class="px-8 py-6 border-b">
        <h2 class="text-lg font-semibold">Select a folder</h2>
        <p class="text-sm text-muted-foreground mt-1">
          Choose a folder containing video files to import. Files will be renamed and organized
          according to your naming format.
        </p>
        <p class="text-xs text-muted-foreground mt-2">
          Allowed roots: library, recycle, and downloads paths from system settings.
        </p>
      </div>

      <div class="flex-1 px-8 py-6 overflow-hidden flex flex-col min-h-0">
        <Tabs
          value={props.state.flow.inputMode()}
          onChange={props.state.setInputMode}
          class="flex-1 flex flex-col min-h-0 overflow-hidden"
        >
          <TabsList class="w-fit">
            <TabsTrigger value="browser" class="gap-2">
              <IconListTree class="h-4 w-4" />
              Browse
            </TabsTrigger>
            <TabsTrigger value="manual" class="gap-2">
              <IconTypography class="h-4 w-4" />
              Manual Path
            </TabsTrigger>
          </TabsList>

          <TabsContent value="browser" class="flex-1 mt-6 min-h-0 overflow-hidden">
            <div class="h-full border rounded-lg overflow-hidden bg-background">
              <Show when={props.state.allowedRoots().length > 0}>
                <div class="border-b bg-muted/20 px-3 py-2">
                  <Tabs
                    value={props.state.activeBrowseRoot()?.key ?? ""}
                    onChange={props.state.selectBrowseRoot}
                  >
                    <TabsList class="h-8 w-fit">
                      <For each={props.state.allowedRoots()}>
                        {(root) => (
                          <TabsTrigger value={root.key} class="px-3 text-xs">
                            {root.label}
                          </TabsTrigger>
                        )}
                      </For>
                    </TabsList>
                  </Tabs>
                </div>
              </Show>
              <Suspense
                fallback={
                  <div class="h-full flex items-center justify-center">
                    <IconLoader2 class="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                }
              >
                <Show when={props.state.activeBrowseRoot()} keyed>
                  {(root) => (
                    <FileBrowser
                      onSelect={(selectedPath) => {
                        props.state.setPathFromBrowserSelection(selectedPath);
                      }}
                      directoryOnly
                      initialPath={root.path}
                      height="100%"
                    />
                  )}
                </Show>
              </Suspense>
            </div>
          </TabsContent>

          <TabsContent value="manual" class="flex-1 mt-6 min-h-0 overflow-auto">
            <section
              aria-label="Drop zone for folder import"
              class={cn(
                "h-full min-h-[300px] border-2 border-dashed rounded-lg p-8 transition-colors flex flex-col items-center justify-center",
                props.state.flow.isDragOver()
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/20 hover:border-muted-foreground/40",
              )}
              onDragOver={props.state.flow.handleDragOver}
              onDragLeave={props.state.flow.handleDragLeave}
              onDrop={props.state.flow.handleDrop}
            >
              <div class="rounded-full bg-muted p-4 mb-4">
                <IconUpload class="h-8 w-8 text-muted-foreground" />
              </div>
              <p class="font-medium text-center">Drag and drop a folder here</p>
              <p class="text-sm text-muted-foreground mt-1 text-center">
                or enter the path manually below
              </p>
              <div class="w-full max-w-lg mt-6 space-y-2">
                <TextField
                  value={props.state.flow.path()}
                  onChange={props.state.setPathFromManualInput}
                >
                  <TextFieldLabel>Folder Path</TextFieldLabel>
                  <TextFieldInput
                    id="folder-path-input"
                    placeholder="/path/to/videos"
                    class="font-mono text-sm"
                    aria-describedby="folder-formats-help"
                  />
                </TextField>
                <p id="folder-formats-help" class="text-xs text-muted-foreground">
                  Supported formats: mkv, mp4, avi, webm, m4v. Paths must stay inside library,
                  recycle, or downloads roots.
                </p>
              </div>
            </section>
          </TabsContent>
        </Tabs>
      </div>

      <div class="px-8 py-4 border-t bg-muted/30">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <Show when={props.state.flow.path()}>
              <IconFolderOpen class="h-4 w-4 text-muted-foreground" />
              <span class="text-sm font-mono text-muted-foreground truncate max-w-md">
                {props.state.flow.path()}
              </span>
              <Button variant="ghost" size="icon" class="h-6 w-6" onClick={props.state.clearPath}>
                <IconX class="h-3 w-3" />
              </Button>
            </Show>
          </div>
          <Button
            onClick={props.state.flow.handleScan}
            disabled={!props.state.flow.path() || props.state.flow.scanMutation.isPending}
          >
            <Show
              when={!props.state.flow.scanMutation.isPending}
              fallback={
                <>
                  <IconLoader2 class="mr-2 h-4 w-4 animate-spin" />
                  Scanning...
                </>
              }
            >
              <IconSearch class="mr-2 h-4 w-4" />
              Scan Folder
            </Show>
          </Button>
        </div>
      </div>
    </div>
  );
}

function ImportReviewStep(props: { state: ImportPageState }) {
  return (
    <div class="h-full flex flex-col overflow-hidden">
      <div class="px-8 py-6 border-b">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-lg font-semibold">Review files</h2>
            <p class="text-sm text-muted-foreground mt-1">
              Found {props.state.flow.scannedFiles().length} file(s)
              <Show when={props.state.flow.skippedFiles().length > 0}>
                <span class="text-warning dark:text-warning">
                  {" "}
                  - {props.state.flow.skippedFiles().length} skipped
                </span>
              </Show>
            </p>
            <p class="mt-2 max-w-3xl text-xs text-muted-foreground">
              Bakarr keeps the import explanation next to each file: coverage, already-mapped
              episodes, duplicate conflicts, and the match reason that picked a series.
            </p>
          </div>
          <Badge variant="secondary" class="text-sm">
            {props.state.flow.selectedFiles().size} selected
          </Badge>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
        <div class="px-8 py-6 border-b bg-muted/20">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-medium flex items-center gap-2">
              <IconListTree class="h-4 w-4 text-primary" />
              Suggested Series
            </h3>
            <Dialog
              open={props.state.flow.isSearchOpen()}
              onOpenChange={props.state.flow.setIsSearchOpen}
            >
              <DialogTrigger as={Button} variant="outline" size="sm" class="h-7 text-xs gap-1.5">
                <IconPlus class="h-3.5 w-3.5" />
                Add Series
              </DialogTrigger>
              <DialogContent class="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Search Anime</DialogTitle>
                  <DialogDescription>
                    Search for the series to match your files against.
                  </DialogDescription>
                </DialogHeader>
                <div class="py-4">
                  <ManualSearch
                    onSelect={props.state.flow.handleManualAdd}
                    existingIds={props.state.candidateIds()}
                  />
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <Show
            when={props.state.flow.candidates().length > 0}
            fallback={
              <div class="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <p class="text-sm">No series suggestions found.</p>
                <p class="text-xs mt-1">Try adding one manually.</p>
              </div>
            }
          >
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              <For each={props.state.flow.candidates()}>
                {(candidate) => (
                  <CandidateCard
                    candidate={candidate}
                    libraryIds={props.state.flow.libraryIds()}
                    isSelected={props.state.flow.selectedCandidateIds().has(candidate.id)}
                    isLocal={props.state.flow.libraryIds().has(candidate.id)}
                    isManual={props.state.manualCandidateIds().has(candidate.id)}
                    onToggle={() => props.state.flow.toggleCandidate(candidate)}
                    class="rounded-lg"
                  />
                )}
              </For>
            </div>
          </Show>
        </div>

        <ul class="divide-y" aria-label="Scanned files for import">
          <For each={props.state.flow.scannedFiles()}>
            {(file) => (
              <FileRow
                file={file}
                animeOptions={props.state.animeOptions()}
                isSelected={props.state.flow.selectedFiles().has(file.source_path)}
                selectedAnimeId={props.state.flow.selectedFiles().get(file.source_path)?.anime_id}
                currentEpisode={
                  props.state.flow.selectedFiles().get(file.source_path)?.episode_number
                }
                currentSeason={
                  props.state.flow.selectedFiles().get(file.source_path)?.season ?? null
                }
                onToggle={(id) => props.state.flow.toggleFile(file, id)}
                onAnimeChange={(id) => props.state.flow.updateFileAnime(file, id)}
                onMappingChange={(season, episode) =>
                  props.state.flow.updateFileMapping(file, season, episode)
                }
              />
            )}
          </For>
        </ul>

        <Show when={props.state.flow.skippedFiles().length > 0}>
          <details class="mx-8 my-4 border rounded-lg">
            <summary class="px-4 py-2 text-sm text-muted-foreground cursor-pointer hover:bg-muted/50">
              {props.state.flow.skippedFiles().length} skipped file(s)
            </summary>
            <div class="divide-y border-t">
              <For each={props.state.flow.skippedFiles()}>
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

      <div class="px-8 py-4 border-t bg-muted/30">
        <div class="flex items-center justify-between">
          <Button variant="ghost" onClick={() => props.state.flow.setStep("scan")}>
            <IconArrowLeft class="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button
            onClick={props.state.flow.handleImport}
            disabled={
              props.state.flow.selectedFiles().size === 0 ||
              props.state.flow.importMutation.isPending
            }
          >
            <Show
              when={!props.state.flow.importMutation.isPending}
              fallback={
                <>
                  <IconLoader2 class="mr-2 h-4 w-4 animate-spin" />
                  Importing...
                </>
              }
            >
              Import {props.state.flow.selectedFiles().size} File
              {props.state.flow.selectedFiles().size !== 1 ? "s" : ""}
              <IconArrowRight class="ml-2 h-4 w-4" />
            </Show>
          </Button>
        </div>
      </div>
    </div>
  );
}
