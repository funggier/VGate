import { createHash } from "node:crypto";
import { mkdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { runClipStudioHelper } from "./helper.js";

export interface ClipStudioServiceOptions {
  exePath: string;
  helperPath: string;
  captureDir: string;
  powershellPath?: string;
  timeoutMs?: number;
  runHelper?: (
    action: string,
    args?: Record<string, string | number | boolean | undefined>,
    timeoutMs?: number
  ) => Promise<Record<string, unknown>>;
}

export type CaptureResult =
  | { mode: "file"; metadata: Record<string, unknown> }
  | { mode: "inline"; metadata: Record<string, unknown>; data: string; mimeType: "image/png" };

export class ClipStudioService {
  private readonly exePath: string;
  private readonly helperPath: string;
  private readonly captureDir: string;
  private readonly powershellPath: string;
  private readonly timeoutMs: number;
  private readonly runHelperImpl: (
    action: string,
    args?: Record<string, string | number | boolean | undefined>,
    timeoutMs?: number
  ) => Promise<Record<string, unknown>>;

  constructor(options: ClipStudioServiceOptions) {
    this.exePath = options.exePath;
    this.helperPath = options.helperPath;
    this.captureDir = resolve(options.captureDir);
    this.powershellPath = options.powershellPath ?? "powershell.exe";
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.runHelperImpl = options.runHelper ?? ((action, args, timeoutMs) =>
      runClipStudioHelper(this.powershellPath, this.helperPath, {
        action,
        args,
        timeoutMs: timeoutMs ?? this.timeoutMs
      }));
  }

  private helper(action: string, args: Record<string, string | number | boolean | undefined> = {}, timeoutMs = this.timeoutMs) {
    return this.runHelperImpl(action, { ExePath: this.exePath, ...args }, timeoutMs);
  }

  async applicationStatus(): Promise<Record<string, unknown>> {
    return await this.helper("status");
  }

  async launch(): Promise<Record<string, unknown>> {
    return await this.helper("launch", {}, 30000);
  }

  async focus(): Promise<Record<string, unknown>> {
    return await this.helper("focus");
  }

  async openFile(filePath: string): Promise<Record<string, unknown>> {
    if (!isAbsolute(filePath)) throw new Error("filePath must be absolute.");
    const info = await stat(filePath).catch(() => null);
    if (!info?.isFile()) throw new Error("File does not exist: " + filePath);
    return await this.helper("open", { FilePath: filePath }, 30000);
  }

  async save(): Promise<Record<string, unknown>> {
    return await this.shortcut(["CTRL", "S"]);
  }

  async undo(): Promise<Record<string, unknown>> {
    return await this.shortcut(["CTRL", "Z"]);
  }

  async redo(): Promise<Record<string, unknown>> {
    return await this.shortcut(["CTRL", "Y"]);
  }

  async keyPress(key: string): Promise<Record<string, unknown>> {
    return await this.helper("keys", { KeysJson: JSON.stringify([key]) });
  }

  async shortcut(keys: string[]): Promise<Record<string, unknown>> {
    if (keys.length < 1 || keys.length > 8) throw new Error("keys must contain between 1 and 8 entries.");
    return await this.helper("keys", { KeysJson: JSON.stringify(keys) });
  }

  async mouseClick(input: { x: number; y: number; button?: "left" | "right" | "middle"; clicks?: number }): Promise<Record<string, unknown>> {
    return await this.helper("mouse-click", {
      MouseJson: JSON.stringify({
        x: input.x,
        y: input.y,
        button: input.button ?? "left",
        clicks: input.clicks ?? 1
      })
    });
  }

  async mouseScroll(input: { x: number; y: number; delta: number }): Promise<Record<string, unknown>> {
    return await this.helper("mouse-scroll", {
      MouseJson: JSON.stringify(input)
    });
  }

  async captureWindow(resultMode: "file" | "inline" = "file", maxBytes = 4_000_000): Promise<CaptureResult> {
    if (!Number.isInteger(maxBytes) || maxBytes < 1024 || maxBytes > 20_000_000) {
      throw new Error("maxBytes must be between 1024 and 20000000.");
    }
    await mkdir(this.captureDir, { recursive: true });
    const outputPath = join(this.captureDir, "clipstudio-" + Date.now() + ".png");
    const metadata = await this.helper("capture", { OutputPath: outputPath }, 30000);

    if (resultMode === "file") return { mode: "file", metadata };

    const data = await readFile(outputPath);
    if (data.byteLength > maxBytes) {
      throw new Error("Captured image exceeds maxBytes: " + data.byteLength + " > " + maxBytes);
    }
    const digest = createHash("sha256").update(data).digest("hex");
    return {
      mode: "inline",
      metadata: { ...metadata, sha256: digest, inlineBytes: data.byteLength },
      data: data.toString("base64"),
      mimeType: "image/png"
    };
  }
}
