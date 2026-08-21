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
  const inner = { cause: { code: "SQLITE_CONSTRAINT_UNIQUE" } };
  root.cause = inner;

  assert.deepStrictEqual(isSqliteUniqueConstraint(root), true);

  const cyclic: { cause?: unknown; message: string } = { message: "not sqlite" };
  cyclic.cause = cyclic;
  assert.deepStrictEqual(isSqliteUniqueConstraint(cyclic), false);
});

it("isSqliteUniqueConstraint rejects non-unique constraint violations", () => {
  assert.deepStrictEqual(isSqliteUniqueConstraint({ code: "SQLITE_CONSTRAINT" }), false);
  assert.deepStrictEqual(isSqliteUniqueConstraint({ errno: 19 }), false);
  assert.deepStrictEqual(isSqliteUniqueConstraint({ errno: 787 }), false);
  assert.deepStrictEqual(
    isSqliteUniqueConstraint({ message: "FOREIGN KEY constraint failed" }),
    false,
  );
  assert.deepStrictEqual(isSqliteUniqueConstraint({ message: "NOT NULL constraint failed: x" }), false);
});

it("isSqliteBusyLock detects busy lock codes and messages", () => {
  assert.deepStrictEqual(isSqliteBusyLock({ code: "SQLITE_BUSY" }), true);
  assert.deepStrictEqual(isSqliteBusyLock({ code: "SQLITE_LOCKED" }), true);
  assert.deepStrictEqual(isSqliteBusyLock({ errno: 5 }), true);
  assert.deepStrictEqual(isSqliteBusyLock({ errno: 6 }), true);
  assert.deepStrictEqual(isSqliteBusyLock({ message: "database is locked" }), true);
  assert.deepStrictEqual(isSqliteBusyLock({ message: "database table is locked" }), true);
  assert.deepStrictEqual(isSqliteBusyLock({ code: "SQLITE_CONSTRAINT" }), false);
});
