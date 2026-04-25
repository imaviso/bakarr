import { Match, Schema } from "effect";

import { DiskSpaceError } from "@/features/system/disk-space.ts";
import {
  ConfigValidationError,
  ImageAssetAccessError,
  ImageAssetNotFoundError,
  ImageAssetTooLargeError,
  ProfileNotFoundError,
  StoredConfigCorruptError,
  StoredConfigMissingError,
  StoredUnmappedFolderCorruptError,
} from "@/features/system/errors.ts";
import type { RouteErrorResponse } from "@/http/shared/route-types.ts";

const SystemRouteErrorSchema = Schema.Union(
  ConfigValidationError,
  DiskSpaceError,
  ImageAssetAccessError,
  ImageAssetNotFoundError,
  ImageAssetTooLargeError,
  ProfileNotFoundError,
  StoredConfigCorruptError,
  StoredConfigMissingError,
  StoredUnmappedFolderCorruptError,
);

type SystemRouteError = Schema.Schema.Type<typeof SystemRouteErrorSchema>;

const messageStatus = (status: number) => (error: { readonly message: string }) => ({
  message: error.message,
  status,
});

const systemRouteErrorMappers: {
  [K in SystemRouteError["_tag"]]: (
    error: Extract<SystemRouteError, { _tag: K }>,
  ) => RouteErrorResponse;
} = {
  ConfigValidationError: messageStatus(400),
  DiskSpaceError: messageStatus(500),
  ImageAssetAccessError: (error) => ({ message: error.message, status: error.status }),
  ImageAssetNotFoundError: (error) => ({ message: error.message, status: error.status }),
  ImageAssetTooLargeError: (error) => ({ message: error.message, status: error.status }),
  ProfileNotFoundError: messageStatus(404),
  StoredConfigCorruptError: messageStatus(500),
  StoredConfigMissingError: messageStatus(500),
  StoredUnmappedFolderCorruptError: messageStatus(500),
};

const isSystemRouteError = Schema.is(SystemRouteErrorSchema);

export function mapSystemRouteError(error: unknown): RouteErrorResponse | undefined {
  if (!isSystemRouteError(error)) {
    return undefined;
  }

  return Match.valueTags(error, systemRouteErrorMappers);
}
