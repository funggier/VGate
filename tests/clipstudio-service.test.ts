import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { ClipStudioService } from "../src/providers/clipstudio/service.js";

describe("ClipStudioService", () => {
  test("maps semantic save/undo/redo operations to guarded key chords", async () => {
    const calls: Array<{ action: string; args?: Record<string, unknown> }> = [];
    const service = new ClipStudioService({
      exePath: "C:\\ClipStudioPaint.exe",
      helperPath: "helper.ps1",
      captureDir: join(tmpdir(), "vgate-clipstudio-test-captures"),
      runHelper: async (action, args) => {
        calls.push({ action, args });
        return { ok: true };
      }
    });

    await service.save();
    await service.undo();
    await service.redo();

    expect(calls.map((call) => [call.action, call.args?.KeysJson])).toEqual([
      ["keys", JSON.stringify(["CTRL", "S"])],
      ["keys", JSON.stringify(["CTRL", "Z"])],
      ["keys", JSON.stringify(["CTRL", "Y"])]
    ]);
  });

  test("opens only an existing absolute file and forwards the configured executable", async () => {
    const root = await mkdtemp(join(tmpdir(), "vgate-clipstudio-open-"));
    const file = join(root, "probe.png");
    await writeFile(file, "probe");
    const calls: Array<Record<string, unknown>> = [];
    const service = new ClipStudioService({
      exePath: "C:\\ClipStudioPaint.exe",
      helperPath: "helper.ps1",
      captureDir: root,
      runHelper: async (_action, args) => {
        calls.push(args ?? {});
        return { ok: true };
      }
    });

    try {
      await expect(service.openFile("relative.png")).rejects.toThrow(/absolute/i);
      await service.openFile(file);
      expect(calls.at(-1)).toMatchObject({
        ExePath: "C:\\ClipStudioPaint.exe",
        FilePath: file
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("keeps screenshot output file-backed by default and makes inline payload opt-in", async () => {
    const root = await mkdtemp(join(tmpdir(), "vgate-clipstudio-capture-"));
    const service = new ClipStudioService({
      exePath: "C:\\ClipStudioPaint.exe",
      helperPath: "helper.ps1",
      captureDir: root,
      runHelper: async (action, args) => {
        expect(action).toBe("capture");
        const outputPath = String(args?.OutputPath);
        await writeFile(outputPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
        return { ok: true, outputPath, bytes: 4 };
      }
    });

    try {
      const fileBacked = await service.captureWindow("file");
      expect(fileBacked.mode).toBe("file");

      const inline = await service.captureWindow("inline", 1024);
      expect(inline.mode).toBe("inline");
      if (inline.mode === "inline") {
        expect(inline.data).toBe(Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"));
        expect(inline.metadata).toMatchObject({ inlineBytes: 4 });
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
