import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  FileIcon,
  FolderOpenIcon,
  TreeStructureIcon,
  SpinnerIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  TextTIcon,
  UploadSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { Suspense } from "react";
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
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
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
      <div className="h-[calc(100vh-8rem)] flex flex-col overflow-hidden">
        <ImportTopBar state={props.state} />

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {props.state.flow.step === "scan" && <ImportScanStep state={props.state} />}
          {props.state.flow.step === "review" && <ImportReviewStep state={props.state} />}
        </div>
      </div>

      {props.state.flow.activeAddCandidate && (
        <AddAnimeDialog
          anime={props.state.flow.activeAddCandidate}
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              props.state.flow.closeAddCandidateDialog();
            }
          }}
          onSuccess={props.state.flow.advanceAddCandidateDialog}
        />
      )}
    </>
  );
}

function ImportTopBar(props: { state: ImportPageState }) {
  return (
    <div className="shrink-0 border-b bg-muted px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/anime" search={DEFAULT_ANIME_SEARCH}>
            <Button variant="ghost" size="icon" className="relative after:absolute after:-inset-2">
              <ArrowLeftIcon className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Import Files</h1>
            {props.state.flow.step === "review" && props.state.flow.path && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                <FolderOpenIcon className="h-3 w-3" />
                <span className="font-mono truncate max-w-md">{props.state.flow.path}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {importSteps.map((stepConfig, index) => (
            <div key={stepConfig.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (index < props.state.currentStepIndex) {
                    props.state.flow.setStep(stepConfig.id);
                  }
                }}
                disabled={index > props.state.currentStepIndex}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-none text-sm font-medium transition-colors",
                  props.state.flow.step === stepConfig.id
                    ? "bg-primary text-primary-foreground"
                    : index < props.state.currentStepIndex
                      ? "text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                      : "text-muted-foreground cursor-not-allowed",
                )}
              >
                <span
                  className={cn(
                    "flex items-center justify-center h-5 w-5 rounded-full text-xs",
                    props.state.flow.step === stepConfig.id
                      ? "bg-primary-foreground/20"
                      : index < props.state.currentStepIndex
                        ? "bg-success/20 text-success"
                        : "bg-muted",
                  )}
                >
                  {index < props.state.currentStepIndex ? (
                    <CheckIcon className="h-3 w-3" />
                  ) : (
                    index + 1
                  )}
                </span>
                {stepConfig.label}
              </button>
              {index < importSteps.length - 1 && (
                <div
                  className={cn(
                    "h-px w-6",
                    index < props.state.currentStepIndex ? "bg-primary" : "bg-border",
                  )}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ImportScanStep(props: { state: ImportPageState }) {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-8 py-6 border-b">
        <h2 className="text-lg font-semibold">Select a folder</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Choose a folder containing video files to import. Files will be renamed and organized
          according to your naming format.
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Allowed roots: library, recycle, and downloads paths from system settings.
        </p>
      </div>

      <div className="flex-1 px-8 py-6 overflow-hidden flex flex-col min-h-0">
        <Tabs
          value={props.state.flow.inputMode}
          onValueChange={props.state.setInputMode}
          className="flex-1 flex flex-col min-h-0 overflow-hidden"
        >
          <TabsList className="w-fit">
            <TabsTrigger value="browser" className="gap-2">
              <TreeStructureIcon className="h-4 w-4" />
              Browse
            </TabsTrigger>
            <TabsTrigger value="manual" className="gap-2">
              <TextTIcon className="h-4 w-4" />
              Manual Path
            </TabsTrigger>
          </TabsList>

          <TabsContent value="browser" className="flex-1 mt-6 min-h-0 overflow-hidden">
            <div className="h-full border rounded-none overflow-hidden bg-background">
              {props.state.allowedRoots.length > 0 && (
                <div className="border-b bg-muted px-3 py-2">
                  <Tabs
                    value={props.state.activeBrowseRoot?.key ?? ""}
                    onValueChange={props.state.selectBrowseRoot}
                  >
                    <TabsList className="h-8 w-fit">
                      {props.state.allowedRoots.map((root) => (
                        <TabsTrigger key={root.key} value={root.key} className="px-3 text-xs">
                          {root.label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                </div>
              )}
              <Suspense
                fallback={
                  <div className="h-full flex items-center justify-center">
                    <SpinnerIcon className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                }
              >
                {props.state.activeBrowseRoot && (
                  <FileBrowser
                    key={props.state.activeBrowseRoot.key}
                    onSelect={(selectedPath) => {
                      props.state.setPathFromBrowserSelection(selectedPath);
                    }}
                    directoryOnly
                    initialPath={props.state.activeBrowseRoot.path}
                    height="100%"
                  />
                )}
              </Suspense>
            </div>
          </TabsContent>

          <TabsContent value="manual" className="flex-1 mt-6 min-h-0 overflow-auto">
            <section
              aria-label="Drop zone for folder import"
              className={cn(
                "h-full min-h-[300px] border-2 border-dashed rounded-none p-8 transition-colors flex flex-col items-center justify-center",
                props.state.flow.isDragOver
                  ? "border-primary bg-primary/10"
                  : "border-muted hover:border-muted-foreground",
              )}
              onDragOver={props.state.flow.handleDragOver}
              onDragLeave={props.state.flow.handleDragLeave}
              onDrop={props.state.flow.handleDrop}
            >
              <div className="rounded-full bg-muted p-4 mb-4">
                <UploadSimpleIcon className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="font-medium text-center">Drag and drop a folder here</p>
              <p className="text-sm text-muted-foreground mt-1 text-center">
                or enter the path manually below
              </p>
              <div className="w-full max-w-lg mt-6 space-y-2">
                <Label htmlFor="folder-path-input">Folder Path</Label>
                <Input
                  id="folder-path-input"
                  value={props.state.flow.path}
                  onChange={(event) =>
                    props.state.setPathFromManualInput(event.currentTarget.value)
                  }
                  placeholder="/path/to/videos"
                  className="font-mono text-sm"
                  aria-describedby="folder-formats-help"
                />
                <p id="folder-formats-help" className="text-xs text-muted-foreground">
                  Supported formats: mkv, mp4, avi, webm, m4v. Paths must stay inside library,
                  recycle, or downloads roots.
                </p>
              </div>
            </section>
          </TabsContent>
        </Tabs>
      </div>

      <div className="px-8 py-4 border-t bg-muted">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {props.state.flow.path && (
              <>
                <FolderOpenIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-mono text-muted-foreground truncate max-w-md">
                  {props.state.flow.path}
                </span>
                <Button variant="ghost" size="icon" onClick={props.state.clearPath}>
                  <XIcon className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>
          <Button
            onClick={props.state.flow.handleScan}
            disabled={!props.state.flow.path || props.state.flow.scanMutation.isPending}
          >
            {props.state.flow.scanMutation.isPending ? (
              <>
                <SpinnerIcon className="mr-2 h-4 w-4 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <MagnifyingGlassIcon className="mr-2 h-4 w-4" />
                Scan Folder
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ImportReviewStep(props: { state: ImportPageState }) {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-8 py-6 border-b">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Review files</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Found {props.state.flow.scannedFiles.length} file(s)
              {props.state.flow.skippedFiles.length > 0 && (
                <span className="text-warning dark:text-warning">
                  {" "}
                  - {props.state.flow.skippedFiles.length} skipped
                </span>
              )}
            </p>
            <p className="mt-2 max-w-3xl text-xs text-muted-foreground">
              Bakarr keeps the import explanation next to each file: coverage, already-mapped
              episodes, duplicate conflicts, and the match reason that picked a series.
            </p>
          </div>
          <Badge variant="secondary" className="text-sm">
            {props.state.flow.selectedFiles.size} selected
          </Badge>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
        <div className="px-8 py-6 border-b bg-muted">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <TreeStructureIcon className="h-4 w-4 text-primary" />
              Suggested Series
            </h3>
            <Dialog
              open={props.state.flow.isSearchOpen}
              onOpenChange={props.state.flow.setIsSearchOpen}
            >
              <DialogTrigger
                render={<Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" />}
              >
                <PlusIcon className="h-3.5 w-3.5" />
                Add Series
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Search Anime</DialogTitle>
                  <DialogDescription>
                    Search for the series to match your files against.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <ManualSearch
                    onSelect={props.state.flow.handleManualAdd}
                    existingIds={props.state.candidateIds}
                  />
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {props.state.flow.candidates.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {props.state.flow.candidates.map((candidate) => (
                <CandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  libraryIds={props.state.flow.libraryIds}
                  isSelected={props.state.flow.selectedCandidateIds.has(candidate.id)}
                  isLocal={props.state.flow.libraryIds.has(candidate.id)}
                  isManual={props.state.manualCandidateIds.has(candidate.id)}
                  onToggle={() => props.state.flow.toggleCandidate(candidate)}
                  className=""
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
              <p className="text-sm">No series suggestions found.</p>
              <p className="text-xs mt-1">Try adding one manually.</p>
            </div>
          )}
        </div>

        <ul className="divide-y" aria-label="Scanned files for import">
          {props.state.flow.scannedFiles.map((file) => (
            <FileRow
              key={file.source_path}
              file={file}
              animeOptions={props.state.animeOptions}
              isSelected={props.state.flow.selectedFiles.has(file.source_path)}
              selectedAnimeId={props.state.flow.selectedFiles.get(file.source_path)?.anime_id}
              currentEpisode={props.state.flow.selectedFiles.get(file.source_path)?.episode_number}
              currentSeason={props.state.flow.selectedFiles.get(file.source_path)?.season ?? null}
              onToggle={(id) => props.state.flow.toggleFile(file, id)}
              onAnimeChange={(id) => props.state.flow.updateFileAnime(file, id)}
              onMappingChange={(season, episode) =>
                props.state.flow.updateFileMapping(file, season, episode)
              }
            />
          ))}
        </ul>

        {props.state.flow.skippedFiles.length > 0 && (
          <details className="mx-8 my-4 border rounded-none">
            <summary className="px-4 py-2 text-sm text-muted-foreground cursor-pointer hover:bg-muted">
              {props.state.flow.skippedFiles.length} skipped file(s)
            </summary>
            <div className="divide-y border-t">
              {props.state.flow.skippedFiles.map((file) => (
                <div
                  key={file.path}
                  className="px-4 py-2 flex items-center gap-3 text-muted-foreground"
                >
                  <FileIcon className="h-4 w-4 shrink-0" />
                  <span className="text-xs font-mono truncate flex-1">
                    {file.path.substring(file.path.lastIndexOf("/") + 1)}
                  </span>
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {file.reason}
                  </Badge>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      <div className="px-8 py-4 border-t bg-muted">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => props.state.flow.setStep("scan")}>
            <ArrowLeftIcon className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button
            onClick={props.state.flow.handleImport}
            disabled={
              props.state.flow.selectedFiles.size === 0 || props.state.flow.importMutation.isPending
            }
          >
            {props.state.flow.importMutation.isPending ? (
              <>
                <SpinnerIcon className="mr-2 h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                Import {props.state.flow.selectedFiles.size} File
                {props.state.flow.selectedFiles.size !== 1 ? "s" : ""}
                <ArrowRightIcon className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
