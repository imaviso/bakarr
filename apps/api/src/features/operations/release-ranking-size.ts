import { Either, Option } from "effect";

import { OperationsInputError } from "@/features/operations/errors.ts";

export function parseSizeLabelToBytes(
  value: string | null | undefined,
): Either.Either<Option.Option<number>, OperationsInputError> {
  if (!value || value.trim().length === 0) {
    return Either.right(Option.none());
  }

  const match = value.match(/([0-9.]+)\s*(KiB|MiB|GiB|TiB|KB|MB|GB|TB|B)/i);
  if (!match) {
    return Either.left(
      new OperationsInputError({
        message: `Invalid quality profile size label: ${value}`,
      }),
    );
  }

  const amountRaw = match[1];
  const unitRaw = match[2];

  if (!amountRaw || !unitRaw) {
    return Either.left(
      new OperationsInputError({
        message: `Invalid quality profile size label: ${value}`,
      }),
    );
  }

  const amount = Number.parseFloat(amountRaw);
  const unit = unitRaw.toUpperCase();

  if (!Number.isFinite(amount) || amount < 0) {
    return Either.left(
      new OperationsInputError({
        message: `Invalid quality profile size label: ${value}`,
      }),
    );
  }

  let multiplier = 1024 ** 4;

  if (unit === "B") {
    multiplier = 1;
  } else if (unit === "KIB" || unit === "KB") {
    multiplier = 1024;
  } else if (unit === "MIB" || unit === "MB") {
    multiplier = 1024 ** 2;
  } else if (unit === "GIB" || unit === "GB") {
    multiplier = 1024 ** 3;
  }

  return Either.right(Option.some(Math.round(amount * multiplier)));
}
