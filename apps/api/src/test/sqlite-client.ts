import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Scope from "effect/Scope";

type ExecuteStatement = {
  readonly args?: ReadonlyArray<unknown>;
  readonly sql: string;
};

type ExecuteResult = {
  readonly rows: Array<Record<string, unknown>>;
};

export interface SqliteTestClient {
  close(): void;
  execute(statement: ExecuteStatement): Promise<ExecuteResult>;
  execute(sql: string, args?: ReadonlyArray<unknown>): Promise<ExecuteResult>;
}

export function createClient(input: { readonly url: string }): SqliteTestClient {
  const databaseFile = toDatabaseFile(input.url);
  const scope = Effect.runSync(Scope.make());
  const clientContext = Effect.runSync(
    Layer.buildWithScope(
      SqliteClient.layer({
        filename: databaseFile,
        readonly: false,
      }),
      scope,
    ),
  );
  const client = Context.get(clientContext, SqliteClient.SqliteClient);

  return {
    close() {
      Effect.runSync(Scope.close(scope, Exit.succeed(undefined)));
    },
    async execute(
      sqlOrStatement: ExecuteStatement | string,
      args: ReadonlyArray<unknown> = [],
    ): Promise<ExecuteResult> {
      const statement =
        typeof sqlOrStatement === "string"
          ? { args, sql: sqlOrStatement }
          : { args: sqlOrStatement.args ?? [], sql: sqlOrStatement.sql };

      const rows = await Effect.runPromise(
        client.unsafe(statement.sql, statement.args).withoutTransform,
      );

      return { rows: rows as Array<Record<string, unknown>> };
    },
  };
}

function toDatabaseFile(url: string) {
  return url.startsWith("file:") ? url.slice("file:".length) : url;
}
