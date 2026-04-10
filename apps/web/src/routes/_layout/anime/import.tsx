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
import { createFileRoute, Link, useNavigate } from "@tanstack/solid-router";
import { createEffect, createMemo, createSignal, For, Show, Suspense } from "solid-js";
import * as v from "valibot";
import { AddAnimeDialog } from "~/components/add-anime-dialog";
import { FileBrowser } from "~/components/file-browser";
import { GeneralError } from "~/components/general-error";
import { CandidateCard, FileRow, ManualSearch } from "~/components/import";
import { toImportInputMode, useImportFlow } from "~/components/import/use-import-flow";
import type { FileRowAnimeOption, Step } from "~/components/import/types";
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
import {
  animeListQueryOptions,
  createSystemConfigQuery,
  profilesQueryOptions,
  systemConfigQueryOptions,
} from "~/lib/api";
import { cn } from "~/lib/utils";

type BrowseRootKey = "library" | "recycle" | "downloads";
type AllowedRoot = {
  key: BrowseRootKey;
  label: string;
  path: string;
};

function titleLabel(title: { romaji?: string | undefined; english?: string | undefined }) {
  return title.english || title.romaji || "Unknown title";
}

const ImportSearchSchema = v.object({
  animeId: v.optional(
    v.pipe(
      v.string(),
      v.check((value) => !Number.isNaN(Number(value)) && Number(value) > 0, "Invalid anime id"),
      v.transform(Number),
      v.integer(),
    ),
  ),
});

export const Route = createFileRoute("/_layout/anime/import")({
  validateSearch: (search) => v.parse(ImportSearchSchema, search),
  loader: async ({ context: { queryClient } }) => {
    await Promise.all([
      queryClient.ensureQueryData(animeListQueryOptions()),
      queryClient.ensureQueryData(profilesQueryOptions()),
      queryClient.ensureQueryData(systemConfigQueryOptions()),
    ]);
  },
  component: ImportPage,
  errorComponent: GeneralError,
});

const steps: { id: Step; label: string; description: string }[] = [
  { id: "scan", label: "Select Path", description: "Choose a folder to scan" },
  {
    id: "review",
    label: "Review Files",
    description: "Confirm files to import",
  },
];

function ImportPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const configQuery = createSystemConfigQuery();
  const [selectedBrowseRoot, setSelectedBrowseRoot] = createSignal<BrowseRootKey>("library");
  const [pathAutofillEnabled, setPathAutofillEnabled] = createSignal(true);
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
    animeId: () => search().animeId,
    onImportSuccess: () => {
      void navigate({
        to: "/anime",
        search: { q: "", filter: "all", view: "grid" },
      });
    },
  });

  const currentStepIndex = () => steps.findIndex((s) => s.id === step());
  const allowedRoots = createMemo<AllowedRoot[]>(() => {
    const config = configQuery.data;
    if (!config) return [];
    const roots: AllowedRoot[] = [
      {
        key: "library",
        label: "Library",
        path: config.library.library_path.trim(),
      },
      {
        key: "recycle",
        label: "Recycle",
        path: config.library.recycle_path.trim(),
      },
      {
        key: "downloads",
        label: "Downloads",
        path: config.downloads.root_path.trim(),
      },
    ];

    return roots.filter((root) => root.path.length > 0);
  });
  const animeOptions = createMemo<FileRowAnimeOption[]>(() => {
    const animeList = animeListQuery.data ?? [];
    const candidateList = candidates();
    const animeIds = new Set(animeList.map((anime) => anime.id));

    return [
      ...animeList.map((anime) => ({
        id: anime.id,
        source: "library" as const,
        title: {
          romaji: titleLabel(anime.title),
          ...(anime.title.english ? { english: anime.title.english } : {}),
        },
      })),
      ...candidateList
        .filter((candidate) => !animeIds.has(candidate.id))
        .map((candidate) => ({
          id: candidate.id,
          source: "candidate" as const,
          title: {
            romaji: titleLabel(candidate.title),
            ...(candidate.title.english ? { english: candidate.title.english } : {}),
          },
        })),
    ].toSorted((left, right) => {
      const leftTitle = titleLabel(left.title);
      const rightTitle = titleLabel(right.title);
      return leftTitle.localeCompare(rightTitle);
    });
  });
  const activeBrowseRoot = createMemo(
    () =>
      allowedRoots().find((root) => root.key === selectedBrowseRoot()) ?? allowedRoots()[0] ?? null,
  );

  createEffect(() => {
    const root = activeBrowseRoot();
    if (!root) return;
    if (!path() && pathAutofillEnabled()) {
      setPath(root.path);
    }
  });

  createEffect(() => {
    const roots = allowedRoots();
    if (roots.length === 0) return;
    if (!roots.some((root) => root.key === selectedBrowseRoot())) {
      setSelectedBrowseRoot(roots[0]!.key);
    }
  });

  return (
    <>
      <div class="h-[calc(100vh-8rem)] flex flex-col overflow-hidden">
        {/* Top Header Bar */}
        <div class="shrink-0 border-b bg-muted/30 px-6 py-4">
          <div class="flex items-center justify-between">
            {/* Left: Back + Title */}
            <div class="flex items-center gap-4">
              <Link to="/anime" search={{ q: "", filter: "all", view: "grid" }}>
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
                <Show when={step() === "review" && path()}>
                  <div class="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <IconFolderOpen class="h-3 w-3" />
                    <span class="font-mono truncate max-w-md">{path()}</span>
                  </div>
                </Show>
              </div>
            </div>

            {/* Right: Step Indicator */}
            <div class="flex items-center gap-2">
              <For each={steps}>
                {(s, index) => (
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (index() < currentStepIndex()) setStep(s.id);
                      }}
                      disabled={index() > currentStepIndex()}
                      class={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                        step() === s.id
                          ? "bg-primary text-primary-foreground"
                          : index() < currentStepIndex()
                            ? "text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                            : "text-muted-foreground/50 cursor-not-allowed",
                      )}
                    >
                      <span
                        class={cn(
                          "flex items-center justify-center h-5 w-5 rounded-full text-xs",
                          step() === s.id
                            ? "bg-primary-foreground/20"
                            : index() < currentStepIndex()
                              ? "bg-success/20 text-success"
                              : "bg-muted-foreground/10",
                        )}
                      >
                        <Show when={index() < currentStepIndex()} fallback={index() + 1}>
                          <IconCheck class="h-3 w-3" />
                        </Show>
                      </span>
                      {s.label}
                    </button>
                    <Show when={index() < steps.length - 1}>
                      <div
                        class={cn(
                          "h-px w-6",
                          index() < currentStepIndex() ? "bg-primary" : "bg-border",
                        )}
                      />
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
          <Show when={step() === "scan"}>
            <div class="h-full flex flex-col overflow-hidden">
              {/* Header */}
              <div class="px-8 py-6 border-b">
                <h2 class="text-lg font-semibold">Select a folder</h2>
                <p class="text-sm text-muted-foreground mt-1">
                  Choose a folder containing video files to import. Files will be renamed and
                  organized according to your naming format.
                </p>
                <p class="text-xs text-muted-foreground mt-2">
                  Allowed roots: library, recycle, and downloads paths from system settings.
                </p>
              </div>

              {/* Content */}
              <div class="flex-1 px-8 py-6 overflow-hidden flex flex-col min-h-0">
                <Tabs
                  value={inputMode()}
                  onChange={(value) => setInputMode(toImportInputMode(value))}
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
                      <Show when={allowedRoots().length > 0}>
                        <div class="border-b bg-muted/20 px-3 py-2">
                          <Tabs
                            value={activeBrowseRoot()?.key ?? ""}
                            onChange={(next) => {
                              const root = allowedRoots().find((item) => item.key === next);
                              if (!root) return;
                              setSelectedBrowseRoot(root.key);
                              setPathAutofillEnabled(true);
                              setPath(root.path);
                            }}
                          >
                            <TabsList class="h-8 w-fit">
                              <For each={allowedRoots()}>
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
                        <Show when={activeBrowseRoot()} keyed>
                          {(root) => (
                            <FileBrowser
                              onSelect={(selectedPath) => {
                                setPathAutofillEnabled(false);
                                setPath(selectedPath);
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
                        isDragOver()
                          ? "border-primary bg-primary/5"
                          : "border-muted-foreground/20 hover:border-muted-foreground/40",
                      )}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
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
                          value={path()}
                          onChange={(value) => {
                            setPathAutofillEnabled(false);
                            setPath(value);
                          }}
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
                          Supported formats: mkv, mp4, avi, webm, m4v. Paths must stay inside
                          library, recycle, or downloads roots.
                        </p>
                      </div>
                    </section>
                  </TabsContent>
                </Tabs>
              </div>

              {/* Footer */}
              <div class="px-8 py-4 border-t bg-muted/30">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <Show when={path()}>
                      <IconFolderOpen class="h-4 w-4 text-muted-foreground" />
                      <span class="text-sm font-mono text-muted-foreground truncate max-w-md">
                        {path()}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        class="h-6 w-6"
                        onClick={() => {
                          setPathAutofillEnabled(false);
                          setPath("");
                        }}
                      >
                        <IconX class="h-3 w-3" />
                      </Button>
                    </Show>
                  </div>
                  <Button onClick={handleScan} disabled={!path() || scanMutation.isPending}>
                    <Show
                      when={!scanMutation.isPending}
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
          </Show>

          <Show when={step() === "review"}>
            <div class="h-full flex flex-col overflow-hidden">
              {/* Header */}
              <div class="px-8 py-6 border-b">
                <div class="flex items-center justify-between">
                  <div>
                    <h2 class="text-lg font-semibold">Review files</h2>
                    <p class="text-sm text-muted-foreground mt-1">
                      Found {scannedFiles().length} file(s)
                      <Show when={skippedFiles().length > 0}>
                        <span class="text-warning dark:text-warning">
                          {" "}
                          • {skippedFiles().length} skipped
                        </span>
                      </Show>
                    </p>
                    <p class="mt-2 max-w-3xl text-xs text-muted-foreground">
                      Bakarr keeps the import explanation next to each file: coverage,
                      already-mapped episodes, duplicate conflicts, and the match reason that picked
                      a series.
                    </p>
                  </div>
                  <Badge variant="secondary" class="text-sm">
                    {selectedFiles().size} selected
                  </Badge>
                </div>
              </div>

              {/* Content */}
              <div class="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
                {/* Candidates Section */}
                <div class="px-8 py-6 border-b bg-muted/20">
                  <div class="flex items-center justify-between mb-4">
                    <h3 class="text-sm font-medium flex items-center gap-2">
                      <IconListTree class="h-4 w-4 text-primary" />
                      Suggested Series
                    </h3>
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
                          <DialogDescription>
                            Search for the series to match your files against.
                          </DialogDescription>
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

                  <Show
                    when={candidates().length > 0}
                    fallback={
                      <div class="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                        <p class="text-sm">No series suggestions found.</p>
                        <p class="text-xs mt-1">Try adding one manually.</p>
                      </div>
                    }
                  >
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      <For each={candidates()}>
                        {(candidate) => {
                          const isLocal = () =>
                            animeListQuery.data?.some((a) => a.id === candidate.id);
                          const isSelected = () => selectedCandidateIds().has(candidate.id);
                          const isManual = () =>
                            manualCandidates().some((c) => c.id === candidate.id);

                          return (
                            <CandidateCard
                              candidate={candidate}
                              libraryIds={libraryIds()}
                              isSelected={isSelected()}
                              isLocal={Boolean(isLocal())}
                              isManual={isManual()}
                              onToggle={() => toggleCandidate(candidate)}
                              class="rounded-lg"
                            />
                          );
                        }}
                      </For>
                    </div>
                  </Show>
                </div>

                {/* File List */}
                <ul class="divide-y" aria-label="Scanned files for import">
                  <For each={scannedFiles()}>
                    {(file) => (
                      <FileRow
                        file={file}
                        animeOptions={animeOptions()}
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
                  <details class="mx-8 my-4 border rounded-lg">
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

              {/* Footer */}
              <div class="px-8 py-4 border-t bg-muted/30">
                <div class="flex items-center justify-between">
                  <Button variant="ghost" onClick={() => setStep("scan")}>
                    <IconArrowLeft class="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    onClick={handleImport}
                    disabled={selectedFiles().size === 0 || importMutation.isPending}
                  >
                    <Show
                      when={!importMutation.isPending}
                      fallback={
                        <>
                          <IconLoader2 class="mr-2 h-4 w-4 animate-spin" />
                          Importing...
                        </>
                      }
                    >
                      Import {selectedFiles().size} File
                      {selectedFiles().size !== 1 ? "s" : ""}
                      <IconArrowRight class="ml-2 h-4 w-4" />
                    </Show>
                  </Button>
                </div>
              </div>
            </div>
          </Show>
        </div>
      </div>

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
            onSuccess={advanceAddCandidateDialog}
          />
        )}
      </Show>
    </>
  );
}
