import { Effect, Schema } from "effect";

import type { DownloadSourceMetadata } from "@packages/shared/index.ts";
import {
  DownloadEventMetadataSchema,
  DownloadSourceMetadataSchema,
} from "@packages/shared/index.ts";
import { toSharedParsedEpisodeIdentity } from "@/infra/media/identity/identity.ts";
import { OperationsStoredDataError } from "@/features/operations/errors.ts";

const DownloadSourceMetadataJsonSchema = Schema.parseJson(DownloadSourceMetadataSchema);
const DownloadEventMetadataJsonSchema = Schema.parseJson(DownloadEventMetadataSchema);

export function encodeDownloadSourceMetadata(
  value: DownloadSourceMetadata,
): Effect.Effect<string, OperationsStoredDataError> {
  return Schema.encode(DownloadSourceMetadataJsonSchema)({
    ...value,
    seadex_tags: value.seadex_tags ? [...value.seadex_tags] : undefined,
  }).pipe(
    Effect.mapError(
      (cause) =>
        new OperationsStoredDataError({
          cause,
          message: "Download source metadata is invalid",
        }),
    ),
  );
}

export const decodeDownloadSourceMetadata = Effect.fn(
  "OperationsRepository.decodeDownloadSourceMetadata",
)(function* (value: string | null | undefined) {
  if (!value) {
    return undefined;
  }

  return yield* Schema.decodeUnknown(DownloadSourceMetadataJsonSchema)(value).pipe(
    Effect.map((decoded) => cloneDownloadSourceMetadata(decoded)),
    Effect.mapError(
      (cause) =>
        new OperationsStoredDataError({
          cause,
          message: "Stored download source metadata is corrupt",
        }),
    ),
  );
});

function cloneDownloadSourceMetadata(value: DownloadSourceMetadata): DownloadSourceMetadata {
  return {
    ...value,
    ...(value.seadex_tags ? { seadex_tags: [...value.seadex_tags] } : {}),
    source_identity: toSharedParsedEpisodeIdentity(value.source_identity),
  };
}

export function encodeDownloadEventMetadata(value: {
  covered_episodes?: readonly number[];
  imported_path?: string;
  source_metadata?: DownloadSourceMetadata;
}): Effect.Effect<string, OperationsStoredDataError> {
  return Schema.encode(DownloadEventMetadataJsonSchema)({
    covered_episodes: value.covered_episodes ? [...value.covered_episodes] : undefined,
    imported_path: value.imported_path,
    source_metadata: value.source_metadata,
  }).pipe(
    Effect.mapError(
      (cause) =>
        new OperationsStoredDataError({
          cause,
          message: "Download event metadata is invalid",
        }),
    ),
  );
}
