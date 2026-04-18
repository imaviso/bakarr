export function safeExternalUrl(input: string | undefined): string | undefined {
  if (!input) {
    return undefined;
  }

  const value = input.trim();
  if (!value) {
    return undefined;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
}
