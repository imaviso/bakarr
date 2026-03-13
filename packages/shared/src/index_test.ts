import { assertEquals, assertMatch } from "@std/assert";
import { Schema } from "effect";

import {
  ImportModeSchema,
  PreferredTitleSchema,
  RuleTypeSchema,
} from "./index.ts";

Deno.test("shared config schemas accept canonical literal values", () => {
  const importMode = Schema.decodeUnknownEither(ImportModeSchema)("copy");
  const preferredTitle = Schema.decodeUnknownEither(PreferredTitleSchema)(
    "english",
  );
  const ruleType = Schema.decodeUnknownEither(RuleTypeSchema)("must_not");

  assertEquals(importMode._tag, "Right");
  assertEquals(preferredTitle._tag, "Right");
  assertEquals(ruleType._tag, "Right");
});

Deno.test("shared config schemas reject unsupported literals", () => {
  const importMode = Schema.decodeUnknownEither(ImportModeSchema)("link");
  const preferredTitle = Schema.decodeUnknownEither(PreferredTitleSchema)(
    "kana",
  );

  assertEquals(importMode._tag, "Left");
  assertEquals(preferredTitle._tag, "Left");

  if (importMode._tag === "Left") {
    assertMatch(importMode.left.message, /copy|move/);
  }

  if (preferredTitle._tag === "Left") {
    assertMatch(preferredTitle.left.message, /romaji|english|native/);
  }
});
