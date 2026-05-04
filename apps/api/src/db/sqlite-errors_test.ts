import { assert, it } from "@effect/vitest";

import { isSqliteBusyLock, isSqliteUniqueConstraint } from "@/db/sqlite-errors.ts";

it("isSqliteUniqueConstraint detects sqlite unique errors across code and message shapes", () => {
  assert.deepStrictEqual(isSqliteUniqueConstraint({ code: "SQLITE_CONSTRAINT_UNIQUE" }), true);
  assert.deepStrictEqual(isSqliteUniqueConstraint({ errno: 2067 }), true);
  assert.deepStrictEqual(
    isSqliteUniqueConstraint({ message: "UNIQUE constraint failed: users.email" }),
    true,
  );
});

it("isSqliteUniqueConstraint walks nested cause chains and avoids cycles", () => {
  const root: { cause?: unknown; message: string } = { message: "outer" };
  const inner = { cause: { code: "SQLITE_CONSTRAINT" } };
  root.cause = inner;

  assert.deepStrictEqual(isSqliteUniqueConstraint(root), true);

  const cyclic: { cause?: unknown; message: string } = { message: "not sqlite" };
  cyclic.cause = cyclic;
  assert.deepStrictEqual(isSqliteUniqueConstraint(cyclic), false);
});

it("isSqliteBusyLock detects busy lock codes and messages", () => {
  assert.deepStrictEqual(isSqliteBusyLock({ code: "SQLITE_BUSY" }), true);
  assert.deepStrictEqual(isSqliteBusyLock({ errno: 5 }), true);
  assert.deepStrictEqual(isSqliteBusyLock({ message: "database is locked" }), true);
  assert.deepStrictEqual(isSqliteBusyLock({ code: "SQLITE_CONSTRAINT" }), false);
});
