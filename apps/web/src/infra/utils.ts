import { type ClassValue, clsx } from "clsx";
import { Effect } from "effect";
import { twMerge } from "tailwind-merge";
import { ClipboardWriteError } from "~/api/effect/errors";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const copyToClipboard = Effect.fn("Clipboard.copyToClipboard")((text: string) =>
  Effect.tryPromise({
    try: () => navigator.clipboard.writeText(text),
    catch: (cause) =>
      new ClipboardWriteError({
        cause,
        message: "Failed to copy link",
      }),
  }),
);

export function safeExternalUrl(input: string | undefined): string | undefined {
  if (!input) return undefined;

  const value = input.trim();
  if (!value) return undefined;

  if (!URL.canParse(value)) {
    return undefined;
  }

  const parsed = new URL(value);
  return parsed.protocol === "http:" || parsed.protocol === "https:"
    ? parsed.toString()
    : undefined;
}
