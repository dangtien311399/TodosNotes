import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isTransientSyncPullError,
  withSyncPullRetry,
} from "../src/services/sync-pull.js";

test("sync pull retries transient Turso errors and then succeeds", async () => {
  let calls = 0;
  const sleeps: number[] = [];

  const result = await withSyncPullRetry(
    async () => {
      calls += 1;
      if (calls < 3) {
        throw Object.assign(new Error("Server returned HTTP status 503"), {
          code: "SERVER_ERROR",
        });
      }
      return "ok";
    },
    [10, 20],
    async (milliseconds) => {
      sleeps.push(milliseconds);
    }
  );

  assert.equal(result, "ok");
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [10, 20]);
});

test("sync pull does not retry schema or stored-data errors", async () => {
  let calls = 0;

  await assert.rejects(
    withSyncPullRetry(
      async () => {
        calls += 1;
        throw new Error("Stored Quill Delta does not match quill_delta_v1");
      },
      [10, 20],
      async () => undefined
    ),
    /Stored Quill Delta/
  );

  assert.equal(calls, 1);
});

test("transient detection follows wrapped query causes", () => {
  const cause = Object.assign(new Error("fetch failed"), {
    code: "UNKNOWN",
  });
  const wrapped = new Error("Sync pull query failed: notes", { cause });

  assert.equal(isTransientSyncPullError(wrapped), true);
  assert.equal(
    isTransientSyncPullError(new Error("SQLITE_ERROR: no such table")),
    false
  );
});
