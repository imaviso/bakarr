import { Schema } from "effect";

import type { Config } from "../../../../../packages/shared/src/index.ts";
import { DatabaseError } from "../../db/database.ts";
import { ExternalCallError } from "../../lib/effect-retry.ts";
export {
  makeCoalescedEffectRunner,
  makeLatestValuePublisher,
  makeSkippingSerializedEffectRunner,
} from "../../lib/effect-coalescing.ts";
import {
  DownloadConflictError,
  DownloadNotFoundError,
  OperationsAnimeNotFoundError,
  OperationsConflictError,
  OperationsInputError,
  OperationsPathError,
  OperationsStoredDataError,
  RssFeedParseError,
  RssFeedRejectedError,
  RssFeedTooLargeError,
} from "./errors.ts";
import { type QBitConfig, QBitConfigModel } from "./qbittorrent.ts";

const knownOperationsErrorSchema = Schema.Union(
  DownloadConflictError,
  DownloadNotFoundError,
  OperationsAnimeNotFoundError,
  OperationsConflictError,
  OperationsInputError,
  OperationsPathError,
  OperationsStoredDataError,
  RssFeedParseError,
  RssFeedRejectedError,
  RssFeedTooLargeError,
  ExternalCallError,
);

const isKnownOperationsError = Schema.is(knownOperationsErrorSchema);

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

export function wrapOperationsError(message: string) {
  return (cause: unknown) => {
    if (cause instanceof DatabaseError || isKnownOperationsError(cause)) {
      return cause;
    }

    return ExternalCallError.make({
      cause,
      message,
      operation: message,
    });
  };
}
