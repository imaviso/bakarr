/// <reference lib="deno.ns" />

import { createDebouncer } from "./debounce.ts";

Deno.test("createDebouncer updates after the delay when scheduled", async () => {
  let current = "";
  const debouncer = createDebouncer((value: string) => {
    current = value;
  }, 10);

  debouncer.schedule("Grand Blue");

  await new Promise((resolve) => setTimeout(resolve, 30));

  if (current !== "Grand Blue") {
    throw new Error(
      `Expected debounced value to be Grand Blue, got ${current}`,
    );
  }

  debouncer.cancel();
});

Deno.test("createDebouncer keeps only the latest queued value", async () => {
  let current = "";
  const debouncer = createDebouncer((value: string) => {
    current = value;
  }, 15);

  debouncer.schedule("Grand");
  setTimeout(() => debouncer.schedule("Grand Blue"), 5);

  await new Promise((resolve) => setTimeout(resolve, 40));

  if (current !== "Grand Blue") {
    throw new Error(`Expected latest value to win, got ${current}`);
  }

  debouncer.cancel();
});

Deno.test("createDebouncer cancel prevents pending updates", async () => {
  let called = false;
  const debouncer = createDebouncer(() => {
    called = true;
  }, 10);

  debouncer.schedule("Grand Blue");
  debouncer.cancel();

  await new Promise((resolve) => setTimeout(resolve, 20));

  if (called) {
    throw new Error("Expected cancel to prevent the pending update");
  }

  debouncer.cancel();
});
