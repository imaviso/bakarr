import { type ClassValue, clsx } from "clsx";
import { Effect } from "effect";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function copyToClipboard(text: string): Promise<boolean> {
  const program = Effect.gen(function* () {
    const modern = yield* Effect.tryPromise({
      try: () => navigator.clipboard.writeText(text).then(() => true as const),
      catch: () => false as const,
    }).pipe(Effect.merge);
    if (modern) return true;

    return yield* Effect.try({
      try: () => {
        const el = document.createElement("textarea");
        el.value = text;
        el.style.cssText =
          "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);opacity:0;pointerEvents:none";
        el.setAttribute("readonly", "");
        document.body.appendChild(el);
        el.focus();
        el.select();
        el.setSelectionRange(0, 99999);
        const result = document.execCommand("copy");
        document.body.removeChild(el);
        return result;
      },
      catch: () => false,
    }).pipe(Effect.merge);
  });

  return Effect.runPromise(program);
}

export function safeExternalUrl(input: string | undefined): string | undefined {
  if (!input) return undefined;

  const value = input.trim();
  if (!value) return undefined;

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
}
