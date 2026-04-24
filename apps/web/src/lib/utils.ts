import { type ClassValue, clsx } from "clsx";
import { Effect, Either } from "effect";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function copyToClipboard(text: string): Promise<boolean> {
  const program = Effect.gen(function* () {
    const modern = yield* Effect.tryPromise({
      try: () => navigator.clipboard.writeText(text),
      catch: () => undefined,
    }).pipe(Effect.matchEffect({
      onSuccess: () => Effect.succeed(true),
      onFailure: () => Effect.succeed(false),
    }));

    if (modern) return true;

    return yield* Effect.try({
      try: () => {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "50%";
        textArea.style.top = "50%";
        textArea.style.transform = "translate(-50%, -50%)";
        textArea.style.opacity = "0";
        textArea.style.pointerEvents = "none";
        textArea.setAttribute("readonly", "");
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        textArea.setSelectionRange(0, 99999);
        const result = document.execCommand("copy");
        document.body.removeChild(textArea);
        return result;
      },
      catch: () => false,
    });
  });

  return Effect.runPromise(program);
}

export function safeExternalUrl(
  input: string | undefined,
): Either.Either<string, void> {
  if (!input) {
    return Either.left(undefined);
  }

  const value = input.trim();
  if (!value) {
    return Either.left(undefined);
  }

  const result = Effect.try({
    try: () => new URL(value),
    catch: () => undefined,
  }).pipe(
    Effect.map((parsed) =>
      parsed && (parsed.protocol === "http:" || parsed.protocol === "https:")
        ? Either.right(parsed.toString())
        : Either.left(undefined),
    ),
    Effect.runSync,
  );

  return result;
}
