/**
 * Internal Download aggregate codecs + low-level event/status SQL.
 * Public access: re-exported from download-repository.ts.
 */
import { eq } from "drizzle-orm";
import { Effect, Schema } from "effect";

import type { DownloadSourceMetadata } from "@packages/shared/index.ts";
import {
  DownloadEventMetadataSchema,
  DownloadSourceMetadataSchema,
} from "@packages/shared/index.ts";
import { toSharedParsedEpisodeIdentity } from "@/features/media/identity/identity.ts";
import type { AppDatabase } from "@/db/database.ts";
import { downloadEvents, downloads } from "@/db/schema.ts";
import { StoredDataError } from "@/features/errors.ts";
import type { DbExecutor } from "@/infra/effect/db.ts";

export interface DownloadEventRecordInput {
  readonly mediaId?: number;
  readonly downloadId?: number;
  readonly eventType: string;
  readonly fromStatus?: string | null;
  readonly toStatus?: string | null;
  readonly message: string;
  readonly metadata?: string | null;
  readonly metadataJson?:
    | {
        readonly covered_units?: readonly number[];
        readonly imported_path?: string;
        readonly source_metadata?: DownloadSourceMetadata;
      }
    | undefined;
}

export function encodeDownloadSourceMetadata(
  value: DownloadSourceMetadata,
): Effect.Effect<string, StoredDataError> {
  return Schema.encodeEffect(Schema.fromJsonString(DownloadSourceMetadataSchema))({
    ...value,
    seadex_tags: value.seadex_tags ? [...value.seadex_tags] : undefined,
  }).pipe(
    Effect.mapError(
      (cause) =>
        new StoredDataError({
          cause,
          message: "Download source metadata is invalid",
        }),
    ),
  );
}

export const decodeDownloadSourceMetadata = Effect.fn(
  "DownloadRepository.decodeDownloadSourceMetadata",
)(function* (value: string | null | undefined) {
  if (!value) {
    return undefined;
  }

  return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(DownloadSourceMetadataSchema))(
    value,
  ).pipe(
    Effect.mapError(
      (cause) =>
        new StoredDataError({
          cause,
          message: "Stored download source metadata is corrupt",
        }),
    ),
    Effect.map((decoded) => cloneDownloadSourceMetadata(decoded)),
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
  covered_units?: readonly number[];
  imported_path?: string;
  source_metadata?: DownloadSourceMetadata;
}): Effect.Effect<string, StoredDataError> {
  return Schema.encodeEffect(Schema.fromJsonString(DownloadEventMetadataSchema))({
    covered_units: value.covered_units ? [...value.covered_units] : undefined,
    imported_path: value.imported_path,
    source_metadata: value.source_metadata,
  }).pipe(
    Effect.mapError(
      (cause) =>
        new StoredDataError({
          cause,
          message: "Download event metadata is invalid",
        }),
    ),
  );
}

export const toDownloadEventInsert = Effect.fn("DownloadRepository.toDownloadEventInsert")(
  function* (input: DownloadEventRecordInput, createdAt: string) {
    const metadata = input.metadataJson
      ? yield* encodeDownloadEventMetadata(input.metadataJson)
      : (input.metadata ?? null);

    return {
      mediaId: input.mediaId ?? null,
      createdAt,
      downloadId: input.downloadId ?? null,
      eventType: input.eventType,
      fromStatus: input.fromStatus ?? null,
      message: input.message,
      metadata,
      toStatus: input.toStatus ?? null,
    } satisfies typeof downloadEvents.$inferInsert;
  },
);

export const insertDownloadEventRow = Effect.fn("DownloadRepository.insertDownloadEventRow")(
  function* (
    db: AppDatabase,
    exec: DbExecutor,
    input: DownloadEventRecordInput,
    createdAt: string,
  ) {
    const row = yield* toDownloadEventInsert(input, createdAt);
    yield* exec.runQuery(
      "Failed to record download event",
      db.insert(downloadEvents).values(row).prepare().effect(),
    );
  },
);

export const deleteDownloadRow = Effect.fn("DownloadRepository.deleteDownloadRow")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  id: number,
  errorMessage: string,
) {
  yield* exec.runQuery(
    errorMessage,
    db.delete(downloads).where(eq(downloads.id, id)).prepare().effect(),
  );
});

export const updateDownloadStatusRow = Effect.fn("DownloadRepository.updateDownloadStatusRow")(
  function* (
    db: AppDatabase,
    exec: DbExecutor,
    input: {
      readonly externalState: string;
      readonly id: number;
      readonly status: string;
    },
    errorMessage: string,
  ) {
    yield* exec.runQuery(
      errorMessage,
      db
        .update(downloads)
        .set({
          externalState: input.externalState,
          status: input.status,
        })
        .where(eq(downloads.id, input.id))
        .prepare()
        .effect(),
    );
  },
);
