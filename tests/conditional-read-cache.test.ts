import { describe, expect, test } from "vitest";
import { createConditionalReadCache, sha256Text } from "../src/conditional-read-cache.js";

describe("conditional read cache", () => {
  test("short-circuits a matching digest inside TTL without retaining content", async () => {
    const cache = createConditionalReadCache();
    let executions = 0;

    const first = await cache.run({
      cacheKey: "status",
      execute: async () => {
        executions += 1;
        return "alpha";
      }
    });

    expect(first.resultDigestSha256).toBe(sha256Text("alpha"));
    expect(first.notModified).toBe(false);
    expect(executions).toBe(1);

    const second = await cache.run({
      cacheKey: "status",
      knownDigest: first.resultDigestSha256,
      cacheMaxAgeMs: 60000,
      execute: async () => {
        executions += 1;
        return "should-not-run";
      }
    });

    expect(second).toMatchObject({
      resultText: "",
      notModified: true,
      resultSuppressed: true,
      cacheHit: true,
      executionSkipped: true,
      contentRetained: false
    });
    expect(executions).toBe(1);
    expect(cache.snapshot()).toMatchObject({ contentRetained: false, entries: 1 });
  });

  test("TTL zero revalidates and suppresses unchanged payload", async () => {
    const cache = createConditionalReadCache();
    let executions = 0;
    const first = await cache.run({
      cacheKey: "providers",
      execute: () => {
        executions += 1;
        return "same";
      }
    });
    const second = await cache.run({
      cacheKey: "providers",
      knownDigest: first.resultDigestSha256,
      cacheMaxAgeMs: 0,
      execute: () => {
        executions += 1;
        return "same";
      }
    });

    expect(second).toMatchObject({
      notModified: true,
      cacheHit: false,
      executionSkipped: false,
      resultText: ""
    });
    expect(executions).toBe(2);
  });

  test("changed content returns a new digest and body", async () => {
    const cache = createConditionalReadCache();
    const first = await cache.run({ cacheKey: "status", execute: () => "alpha" });
    const changed = await cache.run({
      cacheKey: "status",
      knownDigest: first.resultDigestSha256,
      cacheMaxAgeMs: 0,
      execute: () => "beta"
    });

    expect(changed.notModified).toBe(false);
    expect(changed.resultText).toBe("beta");
    expect(changed.resultDigestSha256).not.toBe(first.resultDigestSha256);
  });

  test("errors are not cached", async () => {
    const cache = createConditionalReadCache();
    let executions = 0;
    await expect(cache.run({
      cacheKey: "unstable",
      execute: () => {
        executions += 1;
        throw new Error("read failed");
      }
    })).rejects.toThrow("read failed");

    const recovered = await cache.run({
      cacheKey: "unstable",
      execute: () => {
        executions += 1;
        return "recovered";
      }
    });
    expect(recovered.resultText).toBe("recovered");
    expect(executions).toBe(2);
    expect(cache.snapshot().entries).toBe(1);
  });

  test("metadata cache is bounded", async () => {
    const cache = createConditionalReadCache({ maxEntries: 2, maxCacheAgeMs: 1000 });
    await cache.run({ cacheKey: "one", execute: () => "1" });
    await cache.run({ cacheKey: "two", execute: () => "2" });
    await cache.run({ cacheKey: "three", execute: () => "3" });
    expect(cache.snapshot()).toEqual({
      digestAlgorithm: "sha256",
      contentRetained: false,
      maxEntries: 2,
      maxCacheAgeMs: 1000,
      entries: 2
    });
  });
});
