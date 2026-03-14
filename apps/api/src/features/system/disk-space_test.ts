import { assertEquals } from "@std/assert";

import { makeDefaultConfig } from "./defaults.ts";
import {
  getDiskSpaceSafe,
  mapStatFsToDiskSpace,
  selectStoragePath,
} from "./disk-space.ts";
import { runTestEffect } from "../../test/effect-test.ts";

const baseConfig = { ...makeDefaultConfig("./test.sqlite"), profiles: [] };

Deno.test("mapStatFsToDiskSpace converts statfs values to bytes", () => {
  const result = mapStatFsToDiskSpace({
    bavail: 25n,
    blocks: 100n,
    bsize: 4096n,
  });

  assertEquals(result, { free: 102400, total: 409600 });
});

Deno.test("selectStoragePath prefers library_path", () => {
  const config = {
    ...baseConfig,
    library: { ...baseConfig.library, library_path: "/library" },
    downloads: { ...baseConfig.downloads, root_path: "/downloads" },
    general: { ...baseConfig.general, database_path: "/db/test.sqlite" },
  };
  assertEquals(selectStoragePath(config, "/runtime/test.sqlite"), "/library");
});

Deno.test("selectStoragePath falls back to downloads root_path", () => {
  const config = {
    ...baseConfig,
    library: { ...baseConfig.library, library_path: "" },
    downloads: { ...baseConfig.downloads, root_path: "/downloads" },
    general: { ...baseConfig.general, database_path: "/db/test.sqlite" },
  };
  assertEquals(selectStoragePath(config, "/runtime/test.sqlite"), "/downloads");
});

Deno.test("selectStoragePath falls back to runtime database path", () => {
  const config = {
    ...baseConfig,
    library: { ...baseConfig.library, library_path: "" },
    downloads: { ...baseConfig.downloads, root_path: "" },
    general: { ...baseConfig.general, database_path: "/db/config.sqlite" },
  };

  assertEquals(
    selectStoragePath(config, "/runtime/test.sqlite"),
    "/runtime/test.sqlite",
  );
});

Deno.test("getDiskSpaceSafe returns zeros on error", async () => {
  const result = await runTestEffect(
    getDiskSpaceSafe("/nonexistent/path/that/does/not/exist"),
  );
  assertEquals(result, { free: 0, total: 0 });
});

Deno.test("getDiskSpaceSafe returns real values for valid path", async () => {
  const result = await runTestEffect(getDiskSpaceSafe("/tmp"));
  assertEquals(typeof result.free, "number");
  assertEquals(typeof result.total, "number");
  assertEquals(result.free >= 0, true);
  assertEquals(result.total > 0, true);
});
