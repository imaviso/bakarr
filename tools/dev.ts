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
  child: new Deno.Command("deno", {
    args: ["task", "dev"],
    cwd: task.cwd,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }).spawn(),
}));

let exitCode = 0;
let shuttingDown = false;

const shutdown = (signal?: Deno.Signal) => {
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

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  Deno.addSignalListener(signal, () => shutdown(signal));
}

await Promise.allSettled(
  children.map(async ({ task, child }) => {
    const status = await child.status;

    if (!status.success && exitCode === 0) {
      exitCode = status.code;
    }

    if (!shuttingDown) {
      console.error(`[${task.name}] exited with code ${status.code}`);
      shutdown();
    }
  }),
);

Deno.exit(exitCode);
