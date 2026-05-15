import { Match, Schema } from "effect";

import { DiskSpaceError } from "@/features/system/disk-space.ts";
import {
  ConfigValidationError,
  ImageAssetAccessError,
  ImageAssetNotFoundError,
  ImageAssetTooLargeError,
  StoredConfigCorruptError,
  StoredConfigMissingError,
  StoredUnmappedFolderCorruptError,
} from "@/features/system/errors.ts";
import type { RouteErrorResponse } from "@/http/shared/route-types.ts";
import { errorStatus, fixedStatus, messageStatus } from "@/http/shared/route-errors/helpers.ts";

const internalServerError = fixedStatus("Internal server error", 500);

const SystemRouteErrorSchema = Schema.Union(
  ConfigValidationError,
  DiskSpaceError,
  ImageAssetAccessError,
  ImageAssetNotFoundError,
  ImageAssetTooLargeError,
  StoredConfigCorruptError,
  StoredConfigMissingError,
  StoredUnmappedFolderCorruptError,
);

type SystemRouteError = Schema.Schema.Type<typeof SystemRouteErrorSchema>;

const systemRouteErrorMappers: {
  [K in SystemRouteError["_tag"]]: (
    error: Extract<SystemRouteError, { _tag: K }>,
  ) => RouteErrorResponse;
} = {
  ConfigValidationError: messageStatus(400),
  DiskSpaceError: internalServerError,
  ImageAssetAccessError: errorStatus,
  ImageAssetNotFoundError: errorStatus,
  ImageAssetTooLargeError: errorStatus,
  StoredConfigCorruptError: internalServerError,
  StoredConfigMissingError: internalServerError,
  StoredUnmappedFolderCorruptError: internalServerError,
};

const isSystemRouteError = Schema.is(SystemRouteErrorSchema);

export function mapSystemRouteError(error: unknown): RouteErrorResponse | undefined {
  if (!isSystemRouteError(error)) {
    return undefined;
  }

  return Match.valueTags(error, systemRouteErrorMappers);
}
