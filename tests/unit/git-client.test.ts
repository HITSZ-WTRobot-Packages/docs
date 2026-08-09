import { describe, expect, test } from "bun:test";

import { retryGitOperation } from "../../scripts/sync/git-client";
import { SyncDiagnostic } from "../../src/lib/sources/diagnostic";

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected promise to reject.");
}

describe("Git operation retries", () => {
  test("retries transient failures up to the configured bound", async () => {
    let attempts = 0;
    const result = await retryGitOperation(
      () => {
        attempts += 1;
        return attempts < 3 ? Promise.reject(new Error("transient")) : Promise.resolve("ok");
      },
      { attempts: 3, delayMs: 0 },
    );

    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  test("does not retry deterministic synchronization diagnostics", async () => {
    let attempts = 0;
    const error = await captureRejection(
      retryGitOperation(
        () => {
          attempts += 1;
          return Promise.reject(new SyncDiagnostic("SYNC_GIT_INVALID_REVISION", "invalid"));
        },
        { attempts: 3, delayMs: 0 },
      ),
    );

    expect(error).toMatchObject({ code: "SYNC_GIT_INVALID_REVISION" });
    expect(attempts).toBe(1);
  });

  test("returns the last transient failure after exhausting attempts", async () => {
    const failures = [new Error("first"), new Error("second"), new Error("third")];
    const error = await captureRejection(
      retryGitOperation(() => Promise.reject(failures.shift()), { attempts: 3, delayMs: 0 }),
    );

    expect(error).toMatchObject({ message: "third" });
    expect(failures).toHaveLength(0);
  });
});
