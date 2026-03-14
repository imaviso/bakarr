import { Effect } from "effect";

import type { Config } from "../../../../../packages/shared/src/index.ts";
import { DatabaseError } from "../../db/database.ts";
import {
  DownloadConflictError,
  DownloadNotFoundError,
  OperationsAnimeNotFoundError,
  type OperationsError,
  OperationsInputError,
} from "./errors.ts";
import type { QBitConfig } from "./qbittorrent.ts";

export type TryDatabasePromise = <A>(
  message: string,
  try_: () => Promise<A>,
) => Effect.Effect<A, DatabaseError>;

export type TryOperationsPromise = <A>(
  message: string,
  try_: () => Promise<A>,
) => Effect.Effect<A, OperationsError | DatabaseError>;

export function maybeQBitConfig(config: Config): QBitConfig | null {
  if (!config.qbittorrent.enabled || !config.qbittorrent.password) {
    return null;
  }

  return {
    baseUrl: config.qbittorrent.url,
    category: config.qbittorrent.default_category,
    password: config.qbittorrent.password,
    username: config.qbittorrent.username,
  };
}

export function dbError(message: string) {
  return (cause: unknown) => new DatabaseError({ cause, message });
}

export function wrapOperationsError(message: string) {
  return (cause: unknown) => {
    if (
      cause instanceof OperationsAnimeNotFoundError ||
      cause instanceof OperationsInputError ||
      cause instanceof DownloadNotFoundError ||
      cause instanceof DownloadConflictError ||
      cause instanceof DatabaseError
    ) {
      return cause;
    }

    return new DatabaseError({ cause, message });
  };
}

export const tryDatabasePromise: TryDatabasePromise = (message, try_) =>
  Effect.tryPromise({
    try: try_,
    catch: dbError(message),
  });

export const tryOperationsPromise: TryOperationsPromise = (message, try_) =>
  Effect.tryPromise({
    try: try_,
    catch: wrapOperationsError(message),
  });
