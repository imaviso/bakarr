import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDebouncer } from "./debounce";

beforeEach(() => {
  vi.useFakeTimers();
});

describe("createDebouncer", () => {
  it("updates after the delay when scheduled", () => {
    let current = "";
    const debouncer = createDebouncer((value: string) => {
      current = value;
    }, 10);

    debouncer.schedule("Grand Blue");
    expect(current).toBe("");

    vi.advanceTimersByTime(10);
    expect(current).toBe("Grand Blue");

    debouncer.cancel();
  });

  it("keeps only the latest queued value", () => {
    let current = "";
    const debouncer = createDebouncer((value: string) => {
      current = value;
    }, 15);

    debouncer.schedule("Grand");
    vi.advanceTimersByTime(5);
    debouncer.schedule("Grand Blue");

    vi.advanceTimersByTime(15);
    expect(current).toBe("Grand Blue");

    debouncer.cancel();
  });

  it("cancel prevents pending updates", () => {
    let called = false;
    const debouncer = createDebouncer(() => {
      called = true;
    }, 10);

    debouncer.schedule("Grand Blue");
    debouncer.cancel();

    vi.advanceTimersByTime(20);
    expect(called).toBe(false);
  });
});
