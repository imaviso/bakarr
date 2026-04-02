import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

type ExecuteStatement = {
  readonly args?: ReadonlyArray<unknown>;
  readonly sql: string;
};

type ExecuteResult = {
  readonly rows: Array<Record<string, unknown>>;
};

export interface SqliteTestClient {
  readonly execute: {
    (statement: ExecuteStatement): Effect.Effect<ExecuteResult, unknown>;
    (sql: string, args?: ReadonlyArray<unknown>): Effect.Effect<ExecuteResult, unknown>;
  };
}

export const withSqliteTestClientEffect = Effect.fn("Test.withSqliteTestClientEffect")(function* <
  A,
  E,
  R,
>(input: {
  readonly url: string;
  readonly run: (client: SqliteTestClient) => Effect.Effect<A, E, R>;
}) {
  const databaseFile = toDatabaseFile(input.url);

  return yield* Effect.scoped(
    Effect.gen(function* () {
      const clientContext = yield* Layer.build(
        SqliteClient.layer({
          filename: databaseFile,
          readonly: false,
        }),
      );
      const client = Context.get(clientContext, SqliteClient.SqliteClient);

      const execute = Effect.fn("Test.SqliteTestClient.execute")(function* (
        sqlOrStatement: ExecuteStatement | string,
        args: ReadonlyArray<unknown> = [],
      ) {
        const statement =
          typeof sqlOrStatement === "string"
            ? { args, sql: sqlOrStatement }
            : { args: sqlOrStatement.args ?? [], sql: sqlOrStatement.sql };

        const rows = yield* client.unsafe(statement.sql, statement.args).withoutTransform;

        return { rows: rows as Array<Record<string, unknown>> };
      });

      return yield* input.run({ execute });
    }),
  );
});

function toDatabaseFile(url: string) {
  return url.startsWith("file:") ? url.slice("file:".length) : url;
}
