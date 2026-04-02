import { CommandExecutor, HttpApp } from "@effect/platform";
import { ManagedRuntime, Effect, Layer, Redacted } from "effect";

import { makeApiLifecycleLayers } from "@/api-lifecycle-layers.ts";
import { createHttpApp } from "@/http/http-app.ts";
import { type EmbeddedWebAsset } from "@/http/embedded-web.ts";
import { assertEquals, assertMatch, it } from "@/test/vitest.ts";

it.scoped("http app returns 404 for unknown api routes without serving the app shell", () =>
  withHttpHandlerEffect(
    makeAssets({
      "index.html": "<html><body>app shell</body></html>",
    }),
    (handler) =>
      Effect.gen(function* () {
        const response = yield* Effect.promise(() =>
          handler(new Request("http://bakarr.local/api/unknown")),
        );

        assertEquals(response.status, 404);
        assertEquals(yield* Effect.promise(() => response.text()), "");
      }),
  ),
);

it.scoped("http app falls back to embedded index.html for app routes", () =>
  withHttpHandlerEffect(
    makeAssets({
      "index.html": "<html><body>app shell</body></html>",
    }),
    (handler) =>
      Effect.gen(function* () {
        const response = yield* Effect.promise(() =>
          handler(new Request("http://bakarr.local/library")),
        );

        assertEquals(response.status, 200);
        assertMatch(yield* Effect.promise(() => response.text()), /app shell/);
      }),
  ),
);

const withHttpHandlerEffect = Effect.fn("Test.withHttpHandlerEffect")(function* <A, E, R>(
  assets: Record<string, EmbeddedWebAsset>,
  run: (handler: (request: Request) => Promise<Response>) => Effect.Effect<A, E, R>,
) {
  const runtime = ManagedRuntime.make(
    makeApiLifecycleLayers(
      {
        bootstrapPassword: Redacted.make("admin"),
        bootstrapUsername: "admin",
        databaseFile: `/tmp/bakarr-http-app-test-${crypto.randomUUID()}.sqlite`,
        port: 9999,
      },
      {
        commandExecutorLayer: Layer.succeed(
          CommandExecutor.CommandExecutor,
          makeCommandExecutorStub((command) => {
            const name = commandName(command);
            const args = commandArgs(command);

            if (name === "df") {
              return Effect.succeed(
                "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/test 1000 250 750 25% /tmp",
              );
            }

            if (name === "ffprobe") {
              return Effect.succeed(
                args.includes("-version") ? "ffprobe version test" : '{"streams":[]}',
              );
            }

            return Effect.die(
              new Error(`unexpected command in test runtime: ${name ?? "unknown"}`),
            );
          }),
        ),
      },
    ).appLayer,
  );

  return yield* Effect.acquireUseRelease(
    Effect.tryPromise(async () => {
      const httpApp = await runtime.runPromise(createHttpApp({ staticWebAssets: assets }));
      const handler = HttpApp.toWebHandlerRuntime(await runtime.runtime())(httpApp);
      return { handler, runtime };
    }),
    ({ handler }) => run(handler),
    ({ runtime }) => Effect.promise(() => runtime.dispose()),
  );
});

function makeCommandExecutorStub(
  runAsString: (
    command: Parameters<CommandExecutor.CommandExecutor["string"]>[0],
  ) => Effect.Effect<string, never>,
): CommandExecutor.CommandExecutor {
  return {
    [CommandExecutor.TypeId]: CommandExecutor.TypeId,
    exitCode: () => {
      throw new Error("exitCode not implemented for test");
    },
    lines: (command, _encoding) =>
      runAsString(command).pipe(
        Effect.map((value) => value.split(/\r?\n/).filter((line) => line.length > 0)),
      ),
    start: () => {
      throw new Error("start not implemented for test");
    },
    stream: () => {
      throw new Error("stream not implemented for test");
    },
    streamLines: () => {
      throw new Error("streamLines not implemented for test");
    },
    string: (command, _encoding) => runAsString(command),
  };
}

function makeAssets(input: Record<string, string>) {
  const encoder = new TextEncoder();

  return Object.fromEntries(
    Object.entries(input).map(([relativePath, body]) => {
      const bytes = encoder.encode(body);

      return [
        relativePath,
        {
          body: bytes,
          contentType: relativePath.endsWith(".html")
            ? "text/html; charset=utf-8"
            : "text/plain; charset=utf-8",
          size: bytes.byteLength,
        } satisfies EmbeddedWebAsset,
      ];
    }),
  );
}

function commandArgs(command: Parameters<CommandExecutor.CommandExecutor["string"]>[0]) {
  if (typeof command === "object" && command !== null && "args" in command) {
    const { args } = command;
    return Array.isArray(args)
      ? args.filter((value): value is string => typeof value === "string")
      : [];
  }

  return [];
}

function commandName(command: Parameters<CommandExecutor.CommandExecutor["string"]>[0]) {
  if (typeof command === "object" && command !== null && "command" in command) {
    return typeof command.command === "string" ? command.command : undefined;
  }

  return undefined;
}
