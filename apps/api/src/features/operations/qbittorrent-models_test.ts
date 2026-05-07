import { assert, it } from "@effect/vitest";

import {
  QBitTorrentClientError,
  QBitConfigModel,
} from "@/features/operations/qbittorrent-models.ts";
import { ImportFileError } from "@/features/operations/download-file-import-errors.ts";

it("QBitTorrentClientError constructs with optional cause", () => {
  const err = new QBitTorrentClientError({ cause: new Error("conn"), message: "timeout" });
  assert.deepStrictEqual(err._tag, "QBitTorrentClientError");
  assert.deepStrictEqual(err.message, "timeout");
});

it("QBitTorrentClientError constructs without cause", () => {
  const err = new QBitTorrentClientError({ message: "failed" });
  assert.deepStrictEqual(err.message, "failed");
});

it("QBitConfigModel constructs", () => {
  const config = new QBitConfigModel({
    baseUrl: "http://localhost:8080",
    password: "",
    username: "admin",
  });
  assert.deepStrictEqual(config.baseUrl, "http://localhost:8080");
  assert.deepStrictEqual(config.password, "");
  assert.deepStrictEqual(config.username, "admin");
});

it("ImportFileError constructs with optional cause", () => {
  const err = new ImportFileError({ message: "import failed" });
  assert.deepStrictEqual(err._tag, "ImportFileError");
  assert.deepStrictEqual(err.message, "import failed");
});

it("ImportFileError constructs with cause", () => {
  const err = new ImportFileError({ cause: new Error("io"), message: "disk full" });
  assert.deepStrictEqual(err.message, "disk full");
});
