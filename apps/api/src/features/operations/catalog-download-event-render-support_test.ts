import { assert, it } from "@effect/vitest";
import { Effect, Stream } from "effect";

import type { DownloadEvent } from "@packages/shared/index.ts";
import {
  renderDownloadEventsExportCsv,
  renderDownloadEventsExportJson,
} from "@/features/operations/catalog-download-event-render-support.ts";

const event: DownloadEvent = {
  anime_id: 7,
  anime_title: "Show, Name",
  created_at: "2025-01-01T00:00:00.000Z",
  download_id: 11,
  event_type: "downloads.imported",
  from_status: "completed",
  id: 1,
  message: 'Imported "episode"\nwith newline',
  metadata: "raw,metadata",
  metadata_json: { imported_path: "/library/Show - 01.mkv" },
  torrent_name: "Show - 01",
  to_status: "imported",
};

function decodeChunks(chunks: readonly Uint8Array[]) {
  const decoder = new TextDecoder();
  return chunks.map((chunk) => decoder.decode(chunk)).join("");
}

it.effect("renderDownloadEventsExportJson wraps streamed events with export metadata", () =>
  Effect.gen(function* () {
    const chunks = yield* Stream.runCollect(
      renderDownloadEventsExportJson(Stream.fromIterable([event]), {
        exported: 1,
        generated_at: "2025-01-01T00:00:00.000Z",
        limit: 10,
        order: "desc",
        total: 1,
        truncated: false,
      }),
    ).pipe(Effect.map((items) => Array.from(items)));

    const json = decodeChunks(chunks);
    assert.match(json, /^\{"events":\[/);
    assert.match(json, /"id":1/);
    assert.match(json, /"message":"Imported \\"episode\\"\\nwith newline"/);
    assert.match(json, /"exported":1/);
    assert.match(json, /"truncated":false/);
  }),
);

it.effect("renderDownloadEventsExportCsv escapes commas, quotes, and newlines", () =>
  Effect.gen(function* () {
    const chunks = yield* Stream.runCollect(
      renderDownloadEventsExportCsv(Stream.fromIterable([event])),
    ).pipe(Effect.map((items) => Array.from(items)));
    const csv = decodeChunks(chunks);

    assert.match(csv, /^id,created_at,event_type/);
    assert.match(csv, /"Show, Name"/);
    assert.match(csv, /"Imported ""episode""\nwith newline"/);
    assert.match(csv, /"raw,metadata"/);
  }),
);
