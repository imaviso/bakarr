import { Effect } from "effect";

import type { DownloadSourceMetadata } from "@packages/shared/index.ts";
import {
  DownloadEventMetadataSchema,
  DownloadSourceMetadataSchema,
} from "@packages/shared/index.ts";
import { toSharedParsedEpisodeIdentity } from "@/infra/media/identity/identity.ts";
import { OperationsStoredDataError } from "@/features/operations/errors.ts";
import { decodeJson, encodeJson } from "@/infra/effect/schema-json.ts";

export function encodeDownloadSourceMetadata(
  value: DownloadSourceMetadata,
): Effect.Effect<string, OperationsStoredDataError> {
  return encodeJson(
    DownloadSourceMetadataSchema,
    {
      ...value,
      seadex_tags: value.seadex_tags ? [...value.seadex_tags] : undefined,
    },
    (cause) =>
      new OperationsStoredDataError({
        cause,
        message: "Download source metadata is invalid",
      }),
  );
}

export const decodeDownloadSourceMetadata = Effect.fn(
  "OperationsRepository.decodeDownloadSourceMetadata",
)(function* (value: string | null | undefined) {
  if (!value) {
    return undefined;
  }

  return yield* decodeJson(
    DownloadSourceMetadataSchema,
    value,
    (cause) =>
      new OperationsStoredDataError({
        cause,
        message: "Stored download source metadata is corrupt",
      }),
  ).pipe(Effect.map((decoded) => cloneDownloadSourceMetadata(decoded)));
});

function cloneDownloadSourceMetadata(value: DownloadSourceMetadata): DownloadSourceMetadata {
  return {
    ...value,
    ...(value.seadex_tags ? { seadex_tags: [...value.seadex_tags] } : {}),
    source_identity: toSharedParsedEpisodeIdentity(value.source_identity),
  };
}

export function encodeDownloadEventMetadata(value: {
  covered_units?: readonly number[];
  imported_path?: string;
  source_metadata?: DownloadSourceMetadata;
}): Effect.Effect<string, OperationsStoredDataError> {
  return encodeJson(
    DownloadEventMetadataSchema,
    {
      covered_units: value.covered_units ? [...value.covered_units] : undefined,
      imported_path: value.imported_path,
      source_metadata: value.source_metadata,
    },
    (cause) =>
      new OperationsStoredDataError({
        cause,
        message: "Download event metadata is invalid",
      }),
  );
}
