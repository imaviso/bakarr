import { describe, expect, it } from "vitest";
import { ApiClientError, ApiDecodeError, ApiUnauthorizedError } from "./api-client";
import { ClipboardWriteError, DownloadEventsExportError, errorMessage } from "./errors";

describe("API effect errors", () => {
  it.each([
    new ApiClientError({ message: "client failed" }),
    new ApiDecodeError({ message: "decode failed" }),
    new ApiUnauthorizedError({ message: "auth failed" }),
    new ClipboardWriteError({ message: "clipboard failed" }),
    new DownloadEventsExportError({ message: "export failed" }),
  ])("returns tagged error messages", (error) => {
    expect(errorMessage(error, "fallback")).toBe(error.message);
  });

  it("uses fallback for unknown errors", () => {
    expect(errorMessage(new Error("plain error"), "fallback")).toBe("fallback");
    expect(errorMessage("bad", "fallback")).toBe("fallback");
  });
});
