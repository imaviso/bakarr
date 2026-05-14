import { assert, it } from "@effect/vitest";

import { parseKeyValueList, parseResourceAttributes } from "@/infra/telemetry.ts";

it("parseKeyValueList parses OpenTelemetry key-value lists", () => {
  assert.deepStrictEqual(parseKeyValueList("region=lan,host=nas,empty="), {
    empty: "",
    host: "nas",
    region: "lan",
  });
});

it("parseKeyValueList ignores malformed entries", () => {
  assert.deepStrictEqual(parseKeyValueList("region=lan,missing,=bad"), {
    region: "lan",
  });
});

it("parseResourceAttributes adds deployment environment when absent", () => {
  assert.deepStrictEqual(parseResourceAttributes("host=nas", "home"), {
    "deployment.environment.name": "home",
    host: "nas",
  });
});

it("parseResourceAttributes preserves explicit deployment environment", () => {
  assert.deepStrictEqual(parseResourceAttributes("deployment.environment.name=prod", "home"), {
    "deployment.environment.name": "prod",
  });
});
