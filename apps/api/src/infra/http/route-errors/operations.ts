import { Match, Schema } from "effect";

import {
  RssFeedParseError,
  RssFeedRejectedError,
  RssFeedTooLargeError,
  OperationsConflictError,
  OperationsNotFoundError,
} from "@/features/operations/errors.ts";
import { ImportFileError } from "@/features/operations/download/download-file-import-errors.ts";
import { UpsertUnitFileError } from "@/features/media/units/media-unit-repository.ts";
import { TorrentClientUnavailableError } from "@/features/operations/torrent/torrent-domain.ts";
import { FileSystemError } from "@/infra/filesystem/filesystem.ts";
import type { RouteErrorResponse } from "@/infra/http/route-types.ts";
import {
  fixedStatus,
  mapTaggedRouteError,
  messageStatus,
} from "@/infra/http/route-errors/helpers.ts";

const OperationsRouteErrorSchema = Schema.Union(
  RssFeedParseError,
  RssFeedRejectedError,
  RssFeedTooLargeError,
  OperationsConflictError,
  OperationsNotFoundError,
  TorrentClientUnavailableError,
  ImportFileError,
  FileSystemError,
  UpsertUnitFileError,
);

type OperationsRouteError = Schema.Schema.Type<typeof OperationsRouteErrorSchema>;

const invalidRssFeed = fixedStatus("RSS feed response was invalid", 503);

const rssTooLarge = fixedStatus("RSS feed payload exceeded the allowed size", 503);

const torrentUnavailable = fixedStatus("Torrent client unavailable", 503);

const operationsRouteErrorMappers: {
  [K in OperationsRouteError["_tag"]]: (
    error: Extract<OperationsRouteError, { _tag: K }>,
  ) => RouteErrorResponse;
} = {
  RssFeedParseError: invalidRssFeed,
  RssFeedRejectedError: messageStatus(400),
  RssFeedTooLargeError: rssTooLarge,
  OperationsConflictError: messageStatus(409),
  OperationsNotFoundError: messageStatus(404),
  TorrentClientUnavailableError: torrentUnavailable,
  ImportFileError: messageStatus(500),
  FileSystemError: messageStatus(500),
  UpsertUnitFileError: messageStatus(500),
};

export const mapOperationsRouteError = mapTaggedRouteError(OperationsRouteErrorSchema, (error) =>
  Match.valueTags(error, operationsRouteErrorMappers),
);
