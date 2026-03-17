import type {
  BulkUnmappedFolderControlRequest,
  UnmappedFolderControlRequest,
} from "~/lib/api";

export async function runFolderBackgroundMatchAction(input: {
  action: UnmappedFolderControlRequest["action"];
  control: (data: UnmappedFolderControlRequest) => Promise<unknown>;
  path: string;
  startScan: () => Promise<unknown>;
}) {
  await input.control({ action: input.action, path: input.path });

  if (input.action === "resume" || input.action === "reset") {
    await input.startScan();
  }
}

export async function runBulkBackgroundMatchAction(input: {
  action: BulkUnmappedFolderControlRequest["action"];
  control: (data: BulkUnmappedFolderControlRequest) => Promise<unknown>;
  startScan: () => Promise<unknown>;
}) {
  await input.control({ action: input.action });

  if (input.action !== "pause_queued") {
    await input.startScan();
  }
}
