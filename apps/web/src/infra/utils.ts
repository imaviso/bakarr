import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function safeExternalUrl(input: string | null | undefined): string | undefined {
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
