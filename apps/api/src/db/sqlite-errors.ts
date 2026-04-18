interface SqliteLikeError {
  readonly code?: string | number;
  readonly errno?: number;
  readonly message?: string;
}

function* causeChain(cause: unknown): Generator<SqliteLikeError> {
  const seen = new Set<unknown>();
  let current: unknown = cause;

  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    yield current as SqliteLikeError;
    current = "cause" in current ? (current as { cause?: unknown }).cause : undefined;
  }
}

function someCauseInChain(cause: unknown, predicate: (error: SqliteLikeError) => boolean): boolean {
  for (const error of causeChain(cause)) {
    if (predicate(error)) {
      return true;
    }
  }

  return false;
}

export function isSqliteUniqueConstraint(cause: unknown): boolean {
  return someCauseInChain(cause, (error) => {
    const code =
      typeof error.code === "string" ? error.code : String(error.code ?? error.errno ?? "");
    const message = error.message ?? "";
    return (
      code === "SQLITE_CONSTRAINT" ||
      code === "SQLITE_CONSTRAINT_UNIQUE" ||
      code === "2067" ||
      code === "19" ||
      code.includes("UNIQUE constraint failed") ||
      message.includes("UNIQUE constraint failed")
    );
  });
}

export function isSqliteBusyLock(cause: unknown): boolean {
  return someCauseInChain(cause, (error) => {
    const code =
      typeof error.code === "string" ? error.code : String(error.code ?? error.errno ?? "");
    const message = error.message ?? "";
    return code === "SQLITE_BUSY" || code === "5" || message.includes("database is locked");
  });
}
