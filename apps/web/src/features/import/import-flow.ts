import type {
  MediaId,
  MediaSearchResult,
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
    | "unit_title"
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
    ...(file.unit_title === undefined ? {} : { unit_title: file.unit_title }),
    ...(file.group === undefined ? {} : { group: file.group }),
    ...(file.quality === undefined ? {} : { quality: file.quality }),
    ...(file.resolution === undefined ? {} : { resolution: file.resolution }),
    ...(file.source_identity === undefined ? {} : { source_identity: file.source_identity }),
    ...(file.video_codec === undefined ? {} : { video_codec: file.video_codec }),
  };

  return Object.values(metadata).some((value) => value !== undefined) ? metadata : undefined;
}

export function buildImportFileRequest(input: {
  mediaId: MediaId;
  file: Pick<
    ScannedFile,
    | "air_date"
    | "audio_channels"
    | "audio_codec"
    | "unit_number"
    | "unit_numbers"
    | "unit_title"
    | "group"
    | "quality"
    | "resolution"
    | "season"
    | "source_identity"
    | "source_path"
    | "video_codec"
  >;
  unitNumber?: number;
  unitNumbers?: number[];
  season?: number;
  sourceMetadata?: DownloadSourceMetadata;
}) {
  return {
    media_id: input.mediaId,
    unit_number: input.unitNumber ?? Math.floor(input.file.unit_number),
    ...(() => {
      const unitNumbers = input.unitNumbers ?? input.file.unit_numbers;
      return unitNumbers === undefined ? {} : { unit_numbers: unitNumbers };
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
  localAnimeIds: ReadonlySet<MediaId>;
  candidates: readonly MediaSearchResult[];
}) {
  const missingIds = [...new Set(input.files.map((file) => file.media_id))].filter(
    (id) => !input.localAnimeIds.has(id),
  );

  return missingIds.flatMap((id) => {
    const candidate = input.candidates.find((entry) => entry.id === id);
    return candidate ? [candidate] : [];
  });
}
