import type {
  AnimeSearchResult,
  DownloadSourceMetadata,
  ImportFileRequest,
  ScannedFile,
} from "~/api/contracts";

export function buildImportSourceMetadata(
  file: Pick<
    ScannedFile,
    | "air_date"
    | "audio_channels"
    | "audio_codec"
    | "episode_title"
    | "group"
    | "quality"
    | "resolution"
    | "source_identity"
    | "video_codec"
  >,
): DownloadSourceMetadata | undefined {
  const metadata: DownloadSourceMetadata = {
    ...(file.air_date === undefined ? {} : { air_date: file.air_date }),
    ...(file.audio_channels === undefined ? {} : { audio_channels: file.audio_channels }),
    ...(file.audio_codec === undefined ? {} : { audio_codec: file.audio_codec }),
    ...(file.episode_title === undefined ? {} : { episode_title: file.episode_title }),
    ...(file.group === undefined ? {} : { group: file.group }),
    ...(file.quality === undefined ? {} : { quality: file.quality }),
    ...(file.resolution === undefined ? {} : { resolution: file.resolution }),
    ...(file.source_identity === undefined ? {} : { source_identity: file.source_identity }),
    ...(file.video_codec === undefined ? {} : { video_codec: file.video_codec }),
  };

  return Object.values(metadata).some((value) => value !== undefined) ? metadata : undefined;
}

export function buildImportFileRequest(input: {
  animeId: number;
  file: Pick<
    ScannedFile,
    | "air_date"
    | "audio_channels"
    | "audio_codec"
    | "episode_number"
    | "episode_numbers"
    | "episode_title"
    | "group"
    | "quality"
    | "resolution"
    | "season"
    | "source_identity"
    | "source_path"
    | "video_codec"
  >;
  episodeNumber?: number;
  episodeNumbers?: number[];
  season?: number;
  sourceMetadata?: DownloadSourceMetadata;
}) {
  return {
    anime_id: input.animeId,
    episode_number: input.episodeNumber ?? Math.floor(input.file.episode_number),
    ...(() => {
      const episodeNumbers = input.episodeNumbers ?? input.file.episode_numbers;
      return episodeNumbers === undefined ? {} : { episode_numbers: episodeNumbers };
    })(),
    ...(() => {
      const season = input.season ?? input.file.season;
      return season === undefined ? {} : { season };
    })(),
    ...(() => {
      const sourceMetadata = input.sourceMetadata ?? buildImportSourceMetadata(input.file);
      return sourceMetadata === undefined ? {} : { source_metadata: sourceMetadata };
    })(),
    source_path: input.file.source_path,
  } satisfies ImportFileRequest;
}

export function findMissingImportCandidates(input: {
  files: readonly ImportFileRequest[];
  localAnimeIds: ReadonlySet<number>;
  candidates: readonly AnimeSearchResult[];
}) {
  const missingIds = [...new Set(input.files.map((file) => file.anime_id))].filter(
    (id) => !input.localAnimeIds.has(id),
  );

  return missingIds.flatMap((id) => {
    const candidate = input.candidates.find((entry) => entry.id === id);
    return candidate ? [candidate] : [];
  });
}
