import { Chunk, Effect, Option, Stream } from "effect";

import { FileSystem, FileSystemError } from "@/infra/filesystem/filesystem.ts";

export interface FileByteRange {
  readonly end: number;
  readonly start: number;
}

const DEFAULT_STREAM_CHUNK_SIZE = 64 * 1024;
const SEEK_FROM_START = 0;

export function createFileChunkStream(
  fs: typeof FileSystem.Service,
  path: string | URL,
  options?: {
    readonly chunkSize?: number;
    readonly range?: FileByteRange;
  },
): Stream.Stream<Uint8Array, FileSystemError> {
  const chunkSize = options?.chunkSize ?? DEFAULT_STREAM_CHUNK_SIZE;
  const range = options?.range;
  const initialRange = range ?? { end: Number.MAX_SAFE_INTEGER, start: 0 };

  return Stream.unwrapScoped(
    Effect.map(fs.openFile(path, { read: true }), (file) =>
      Stream.paginateChunkEffect(initialRange, (current) =>
        Effect.gen(function* () {
          const requestedLength = range
            ? Math.min(chunkSize, current.end - current.start + 1)
            : chunkSize;
          const buffer = new Uint8Array(requestedLength);

          yield* file.seek(current.start, SEEK_FROM_START);
          const read = yield* file.read(buffer);

          if (Option.isNone(read) || read.value === 0) {
            return [Chunk.empty<Uint8Array>(), Option.none<FileByteRange>()] as const;
          }

          const bytesRead = read.value;
          const nextStart = current.start + bytesRead;

          return [
            Chunk.of(buffer.subarray(0, bytesRead)),
            range && nextStart > current.end
              ? Option.none<FileByteRange>()
              : Option.some({
                  ...current,
                  start: nextStart,
                }),
          ] as const;
        }),
      ),
    ),
  );
}
