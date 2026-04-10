export function safeExternalUrl(input: string | undefined): string | undefined {
  if (!input) {
    return;
  }

  const value = input.trim();
  if (!value) {
    return;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : undefined;
  } catch {
    return;
  }
}
