type WorkspaceTask = {
  name: string;
  cwd: string;
};

const workspaceRoot = `${import.meta.dirname}/..`;

const tasks: WorkspaceTask[] = [
  { name: "api", cwd: `${workspaceRoot}/apps/api` },
  { name: "web", cwd: `${workspaceRoot}/apps/web` },
];

const children = tasks.map((task) => ({
  task,
  child: Bun.spawn(["bun", "run", "dev"], {
    cwd: task.cwd,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
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
    const code = await child.exited;

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
