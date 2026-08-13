export function getErrorCode(error: Error): string | undefined {
  if (!("code" in error)) {
    return undefined;
  }

  const code = error.code;
  return typeof code === "string" ? code : undefined;
}
