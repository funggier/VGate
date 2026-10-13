import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { resolveAllowedPath } from "../src/providers/monogame/paths.js";

describe("MonoGame project path sandbox", () => {
  test("accepts descendants and rejects traversal, siblings and prefix escapes", async () => {
    const base = await mkdtemp(join(tmpdir(), "vgate-monogame-root-"));
    const root = join(base, "games");
    const child = join(root, "Qualification");
    const sibling = join(base, "games-escape");
    await mkdir(child, { recursive: true });
    await mkdir(sibling, { recursive: true });

    try {
      expect(resolveAllowedPath(root, child)).toBe(child);
      expect(resolveAllowedPath(root, ".\\Qualification")).toBe(child);
      expect(() => resolveAllowedPath(root, "..\\games-escape")).toThrow(/outside allowed root/i);
      expect(() => resolveAllowedPath(root, sibling)).toThrow(/outside allowed root/i);
      expect(() => resolveAllowedPath(root, root + "-escape")).toThrow(/outside allowed root/i);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("rejects an existing symlink/junction escape when canonicalized", async () => {
    const base = await mkdtemp(join(tmpdir(), "vgate-monogame-link-"));
    const root = join(base, "root");
    const outside = join(base, "outside");
    const link = join(root, "linked-outside");
    await mkdir(root, { recursive: true });
    await mkdir(outside, { recursive: true });
    try {
      await (await import("node:fs/promises")).symlink(outside, link, "junction");
      expect(() => resolveAllowedPath(root, link)).toThrow(/outside allowed root/i);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});