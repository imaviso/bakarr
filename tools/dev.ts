import { spawn, type ChildProcess } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type WorkspaceTask = {
  name: string;
  cwd: string;
};

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const tasks: WorkspaceTask[] = [
  { name: "api", cwd: `${workspaceRoot}/apps/api` },
  { name: "web", cwd: `${workspaceRoot}/apps/web` },
];

const children = tasks.map((task) => ({
  task,
  child: spawn("pnpm", ["dev"], {
    cwd: task.cwd,
    stdio: "inherit",
  }),
}));

let exitCode = 0;
let shuttingDown = false;

const shutdown = (signal?: string) => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  if (signal === "SIGINT") {
    exitCode = 130;
  } else if (signal === "SIGTERM") {
    exitCode = 143;
  }

  for (const { child } of children) {
    try {
      child.kill("SIGTERM");
    } catch {
      // Ignore processes that already exited.
    }
  }
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

await Promise.allSettled(
  children.map(async ({ task, child }) => {
    const code = await waitForExit(child);

    if (code !== 0 && exitCode === 0) {
      exitCode = code;
    }

    if (!shuttingDown) {
      console.error(`[${task.name}] exited with code ${code}`);
      shutdown();
    }
  }),
);

process.exit(exitCode);

function waitForExit(child: ChildProcess) {
  return new Promise<number>((resolveExit) => {
    child.once("exit", (code, signal) => {
      if (typeof code === "number") {
        resolveExit(code);
        return;
      }

      resolveExit(signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 1);
    });
  });
}
