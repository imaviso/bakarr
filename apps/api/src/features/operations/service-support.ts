import { Effect } from "effect";

import type { Config } from "../../../../../packages/shared/src/index.ts";
import { DatabaseError } from "../../db/database.ts";
import {
  toDatabaseError,
  tryDatabasePromise as baseTryDatabasePromise,
} from "../../lib/effect-db.ts";
export {
  makeCoalescedEffectRunner,
  makeLatestValuePublisher,
  makeSkippingSerializedEffectRunner,
} from "../../lib/effect-coalescing.ts";
import {
  DownloadConflictError,
  DownloadNotFoundError,
  ExternalCallError,
  OperationsAnimeNotFoundError,
  OperationsConflictError,
  OperationsInputError,
  OperationsPathError,
  RssFeedRejectedError,
  RssFeedTooLargeError,
} from "./errors.ts";
import { type QBitConfig, QBitConfigModel } from "./qbittorrent.ts";

export type TryDatabasePromise = <A>(
  message: string,
  try_: () => Promise<A>,
) => Effect.Effect<A, DatabaseError>;

export function maybeQBitConfig(config: Config): QBitConfig | null {
  if (!config.qbittorrent.enabled || !config.qbittorrent.password) {
    return null;
  }

  return new QBitConfigModel({
    baseUrl: config.qbittorrent.url,
    category: config.qbittorrent.default_category,
    password: config.qbittorrent.password,
    username: config.qbittorrent.username,
  });
}

export function dbError(message: string) {
  return toDatabaseError(message);
}

export function wrapOperationsError(message: string) {
  return (cause: unknown) => {
    if (
      cause instanceof OperationsAnimeNotFoundError ||
      cause instanceof OperationsInputError ||
      cause instanceof OperationsConflictError ||
      cause instanceof OperationsPathError ||
      cause instanceof DownloadNotFoundError ||
      cause instanceof DownloadConflictError ||
      cause instanceof RssFeedRejectedError ||
      cause instanceof RssFeedTooLargeError ||
      cause instanceof ExternalCallError ||
      cause instanceof DatabaseError
    ) {
      return cause;
    }

    return toDatabaseError(message)(cause);
  };
}

export const tryDatabasePromiseEffect: TryDatabasePromise = (message, try_) =>
  baseTryDatabasePromise(message, try_);

export { tryDatabasePromiseEffect as tryDatabasePromise };
