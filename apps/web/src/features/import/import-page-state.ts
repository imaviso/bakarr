import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { systemConfigQueryOptions } from "~/api/system-config";
import { toImportInputMode, useImportFlow } from "~/features/import/use-import-flow";
import type { FileRowAnimeOption, Step } from "~/features/import/types";
import { animeDisplayTitle } from "~/domain/media/metadata";

export type BrowseRootKey = "library" | "recycle" | "downloads";

export interface AllowedRoot {
  key: BrowseRootKey;
  label: string;
  path: string;
}

export const importSteps: { id: Step; label: string; description: string }[] = [
  { id: "scan", label: "Select Path", description: "Choose a folder to scan" },
  { id: "review", label: "Review Files", description: "Confirm files to import" },
];

interface CreateImportPageStateOptions {
  mediaId: number | undefined;
  onImportSuccess: () => void;
}

export function useImportPageState(options: CreateImportPageStateOptions) {
  const [latestImportTaskId, setLatestImportTaskId] = useState<number | undefined>(undefined);

  const flow = useImportFlow({
    ...(options.mediaId === undefined ? {} : { mediaId: options.mediaId }),
    onImportQueued: (taskId) => {
      setLatestImportTaskId(taskId);
    },
    onImportSuccess: options.onImportSuccess,
  });

  const { data: config } = useSuspenseQuery(systemConfigQueryOptions());
  const [selectedBrowseRoot, setSelectedBrowseRoot] = useState<BrowseRootKey>("library");

  const currentStepIndex = importSteps.findIndex((stepConfig) => stepConfig.id === flow.step);

  const allowedRoots: AllowedRoot[] = [
    {
      key: "library" as const,
      label: "Library",
      path: config.library.library_path.trim(),
    },
    {
      key: "recycle" as const,
      label: "Recycle",
      path: config.library.recycle_path.trim(),
    },
    {
      key: "downloads" as const,
      label: "Downloads",
      path: config.downloads.root_path.trim(),
    },
  ].filter((root) => root.path.length > 0);

  const animeList = flow.animeList;
  const candidateList = flow.candidates;
  const animeIds = new Set(animeList.map((media) => media.id));

  const animeOptions: FileRowAnimeOption[] = [
    ...animeList.map((media) => ({
      id: media.id,
      source: "library" as const,
      title: {
        romaji: animeDisplayTitle(media),
        ...(media.title.english ? { english: media.title.english } : {}),
      },
    })),
    ...candidateList
      .filter((candidate) => !animeIds.has(candidate.id))
      .map((candidate) => ({
        id: candidate.id,
        source: "candidate" as const,
        title: {
          romaji: animeDisplayTitle(candidate),
          ...(candidate.title.english ? { english: candidate.title.english } : {}),
        },
      })),
  ].toSorted((left, right) => left.title.romaji.localeCompare(right.title.romaji));

  const candidateIds = new Set(flow.candidates.map((candidate) => candidate.id));
  const manualCandidateIds = new Set(flow.manualCandidates.map((candidate) => candidate.id));

  const activeBrowseRoot =
    allowedRoots.find((root) => root.key === selectedBrowseRoot) ?? allowedRoots[0] ?? null;

  const setInputMode = (value: string | null | undefined) => {
    flow.setInputMode(toImportInputMode(value));
  };

  const selectBrowseRoot = (value: string | null) => {
    const root = allowedRoots.find((item) => item.key === value);
    if (!root) {
      return;
    }

    setSelectedBrowseRoot(root.key);
    flow.setPath(root.path);
  };

  const clearPath = () => {
    flow.setPath("");
  };

  const setPathFromBrowserSelection = (value: string) => {
    flow.setPath(value);
  };

  const setPathFromManualInput = (value: string) => {
    flow.setPath(value);
  };

  return {
    activeBrowseRoot,
    allowedRoots,
    animeOptions,
    candidateIds,
    clearPath,
    currentStepIndex,
    flow,
    latestImportTaskId,
    manualCandidateIds,
    selectBrowseRoot,
    setPathFromBrowserSelection,
    setPathFromManualInput,
    setInputMode,
  };
}

export type ImportPageState = ReturnType<typeof useImportPageState>;
