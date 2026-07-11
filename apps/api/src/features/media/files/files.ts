import type { VideoFile } from "@packages/shared/index.ts";
import type { DirEntry, FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import { isNotFoundError } from "@/infra/filesystem/fs-errors.ts";
import { Effect } from "effect";
import { classifyMediaArtifact, parseFileSourceIdentity } from "@/infra/media/identity/identity.ts";
import { parseVolumeNumbersFromTitle } from "@/features/operations/search/release-volume.ts";

const VIDEO_EXTENSIONS = [".mkv", ".mp4", ".avi", ".mov", ".webm"];
const VOLUME_EXTENSIONS = [".cbz", ".cbr", ".pdf", ".epub"];

function parseEpisodeNumber(
  name: string,
  path: string,
  isVolumeMedia: boolean,
): number | undefined {
  return extractUnitNumbersFromFile(name, path, isVolumeMedia)[0];
}

// No longer exported — use extractUnitNumbersFromFile directly.

/**
 * Extract unit numbers from a file, preferring volume-number parsing for
 * non-video media (manga/LN). Falls back to the episode identity parser.
 */
export function extractUnitNumbersFromFile(
  name: string,
  path: string,
  isVolumeMedia: boolean,
): readonly number[] {
  if (isVolumeMedia) {
    const volumeNumbers = parseVolumeNumbersFromTitle(name);
    if (volumeNumbers.length > 0) return volumeNumbers;
  }

  const identity = parseFileSourceIdentity(path).source_identity;
  if (!identity || identity.scheme === "daily") return [];
  return identity.unit_numbers;
}

function hasExtension(name: string, extensions: readonly string[]) {
  return extensions.some((ext) => name.toLowerCase().endsWith(ext));
}

export const collectVideoFiles = Effect.fn("MediaService.collectVideoFiles")(function* (
  fs: FileSystemShape,
  rootFolder: string,
) {
  return yield* collectMediaFiles(fs, rootFolder, VIDEO_EXTENSIONS);
});

export const collectVolumeFiles = Effect.fn("MediaService.collectVolumeFiles")(function* (
  fs: FileSystemShape,
  rootFolder: string,
) {
  return yield* collectMediaFiles(fs, rootFolder, VOLUME_EXTENSIONS);
});

const collectMediaFiles = Effect.fn("MediaService.collectMediaFiles")(function* (
  fs: FileSystemShape,
  rootFolder: string,
  extensions: readonly string[],
) {
  const entries: VideoFile[] = [];
  const stack = [rootFolder];
  let isRoot = true;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const isCurrentRoot = isRoot;
    isRoot = false;

    const dirEntries = yield* fs
      .readDir(current)
      .pipe(
        Effect.catchTag("FileSystemError", (error) =>
          !isCurrentRoot && isNotFoundError(error)
            ? Effect.succeed<DirEntry[]>([])
            : Effect.fail(error),
        ),
      );

    for (const entry of dirEntries) {
      const fullPath = `${current.replace(/\/$/, "")}/${entry.name}`;

      if (entry.isDirectory) {
        stack.push(fullPath);
        continue;
      }

      if (!entry.isFile || !hasExtension(entry.name, extensions)) {
        continue;
      }

      const classification = classifyMediaArtifact(fullPath, entry.name);
      if (classification.kind === "extra" || classification.kind === "sample") {
        continue;
      }

      entries.push({
        unit_number: parseEpisodeNumber(entry.name, fullPath, extensions === VOLUME_EXTENSIONS),
        name: entry.name,
        path: fullPath,
        size: entry.size,
      });
    }
  }

  return entries.toSorted((left, right) => left.name.localeCompare(right.name));
});
