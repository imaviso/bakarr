import { OperationsInputError } from "@/features/operations/errors.ts";

export function parseSizeLabelToBytes(
  value: string | null | undefined,
): { _tag: "Left"; left: OperationsInputError } | { _tag: "Right"; right: number | null } {
  if (!value || value.trim().length === 0) {
    return { _tag: "Right", right: null };
  }

  const match = value.match(/([0-9.]+)\s*(KiB|MiB|GiB|TiB|KB|MB|GB|TB|B)/i);
  if (!match) {
    return {
      _tag: "Left",
      left: new OperationsInputError({
        message: `Invalid quality profile size label: ${value}`,
      }),
    };
  }

  const amount = Number.parseFloat(match[1]);
  const unit = match[2].toUpperCase();

  if (!Number.isFinite(amount) || amount < 0) {
    return {
      _tag: "Left",
      left: new OperationsInputError({
        message: `Invalid quality profile size label: ${value}`,
      }),
    };
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

  return { _tag: "Right", right: Math.round(amount * multiplier) };
}
