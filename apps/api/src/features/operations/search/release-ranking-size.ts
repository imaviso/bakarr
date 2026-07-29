import { Result, Option } from "effect";

import { DomainInputError } from "@/features/errors.ts";

export function parseSizeLabelToBytes(
  value: string | null | undefined,
): Result.Result<Option.Option<number>, DomainInputError> {
  if (!value || value.trim().length === 0) {
    return Result.succeed(Option.none());
  }

  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(KiB|MiB|GiB|TiB|KB|MB|GB|TB|B)$/i);
  if (!match) {
    return Result.fail(
      new DomainInputError({
        message: `Invalid quality profile size label: ${value}`,
      }),
    );
  }

  const amountRaw = match[1];
  const unitRaw = match[2];

  if (!amountRaw || !unitRaw) {
    return Result.fail(
      new DomainInputError({
        message: `Invalid quality profile size label: ${value}`,
      }),
    );
  }

  const amount = Number.parseFloat(amountRaw);
  const unit = unitRaw.toUpperCase();

  if (!Number.isFinite(amount) || amount < 0) {
    return Result.fail(
      new DomainInputError({
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

  return Result.succeed(Option.some(Math.round(amount * multiplier)));
}
