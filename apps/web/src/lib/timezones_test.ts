/// <reference lib="deno.ns" />

import { formatTimeZoneLabel, getTimeZoneOptions } from "./timezones.ts";

Deno.test("formatTimeZoneLabel handles system and IANA values", () => {
  if (formatTimeZoneLabel("system") !== "System timezone") {
    throw new Error("Expected system label");
  }

  if (formatTimeZoneLabel("America/Los_Angeles") !== "America/Los Angeles") {
    throw new Error("Expected underscores to be replaced in timezone labels");
  }
});

Deno.test("getTimeZoneOptions keeps the current custom timezone", () => {
  const options = getTimeZoneOptions("Custom/Zone");

  if (!options.some((option) => option.value === "system")) {
    throw new Error("Expected system timezone option");
  }

  if (!options.some((option) => option.value === "Custom/Zone")) {
    throw new Error("Expected custom timezone to remain selectable");
  }
});
