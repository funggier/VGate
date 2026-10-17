import { createHash } from "node:crypto";

const SHA256_RE = /^[0-9a-f]{64}$/i;

export interface ConditionalReadOptions {
  cacheKey: string;
  knownDigest?: string;
  cacheMaxAgeMs?: number;
  execute: () => Promise<string> | string;
}

export interface ConditionalReadResult {
  resultText: string;
  resultDigestSha256: string;
  resultBytes: number;
  resultChars: number;
  returnedChars: number;
  notModified: boolean;
  resultSuppressed: boolean;
  cacheHit: boolean;
  executionSkipped: boolean;
  cacheAgeMs: number | null;
  contentRetained: false;
}

interface CacheEntry {
  resultDigestSha256: string;
  resultBytes: number;
  resultChars: number;
  checkedAtMs: number;
}

export function sha256Text(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function createConditionalReadCache({
  maxEntries = 64,
  maxCacheAgeMs = 300000
}: {
  maxEntries?: number;
  maxCacheAgeMs?: number;
} = {}) {
  if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 10000) {
    throw new RangeError("maxEntries must be an integer between 1 and 10000.");
  }
  if (!Number.isInteger(maxCacheAgeMs) || maxCacheAgeMs < 0 || maxCacheAgeMs > 3600000) {
    throw new RangeError("maxCacheAgeMs must be an integer between 0 and 3600000.");
  }

  const entries = new Map<string, CacheEntry>();

  const normalizeDigest = (value?: string): string | null => {
    if (value == null || value === "") return null;
    if (!SHA256_RE.test(value)) throw new TypeError("known_digest must be a 64-character SHA-256 hex digest.");
    return value.toLowerCase();
  };

  const normalizeAge = (value?: number): number => {
    if (value == null) return 0;
    if (!Number.isInteger(value) || value < 0 || value > maxCacheAgeMs) {
      throw new RangeError(`cache_max_age_ms must be an integer between 0 and ${maxCacheAgeMs}.`);
    }
    return value;
  };

  const write = (cacheKey: string, entry: CacheEntry): void => {
    entries.delete(cacheKey);
    entries.set(cacheKey, entry);
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
  };

  const run = async ({
    cacheKey,
    knownDigest,
    cacheMaxAgeMs,
    execute
  }: ConditionalReadOptions): Promise<ConditionalReadResult> => {
    if (!cacheKey) throw new TypeError("cacheKey must be non-empty.");
    const digest = normalizeDigest(knownDigest);
    const ageLimit = normalizeAge(cacheMaxAgeMs);
    const now = Date.now();

    if (digest && ageLimit > 0) {
      const cached = entries.get(cacheKey);
      if (cached) {
        const age = Math.max(0, now - cached.checkedAtMs);
        if (age <= ageLimit && cached.resultDigestSha256 === digest) {
          entries.delete(cacheKey);
          entries.set(cacheKey, cached);
          return {
            resultText: "",
            resultDigestSha256: cached.resultDigestSha256,
            resultBytes: cached.resultBytes,
            resultChars: cached.resultChars,
            returnedChars: 0,
            notModified: true,
            resultSuppressed: true,
            cacheHit: true,
            executionSkipped: true,
            cacheAgeMs: age,
            contentRetained: false
          };
        }
      }
    }

    const text = await execute();
    const resultDigestSha256 = sha256Text(text);
    const resultBytes = Buffer.byteLength(text, "utf8");
    const resultChars = text.length;
    write(cacheKey, {
      resultDigestSha256,
      resultBytes,
      resultChars,
      checkedAtMs: Date.now()
    });

    const notModified = Boolean(digest && digest === resultDigestSha256);
    return {
      resultText: notModified ? "" : text,
      resultDigestSha256,
      resultBytes,
      resultChars,
      returnedChars: notModified ? 0 : resultChars,
      notModified,
      resultSuppressed: notModified,
      cacheHit: false,
      executionSkipped: false,
      cacheAgeMs: null,
      contentRetained: false
    };
  };

  return {
    run,
    clear(): void {
      entries.clear();
    },
    snapshot() {
      return {
        digestAlgorithm: "sha256" as const,
        contentRetained: false as const,
        maxEntries,
        maxCacheAgeMs,
        entries: entries.size
      };
    }
  };
}
