import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { createConditionalReadCache } from "../../conditional-read-cache.js";
import { ClipStudioService } from "./service.js";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Required environment variable " + name + " is not set.");
  return value;
}

function numericEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(name + " must be a positive integer.");
  return value;
}

function success(payload: unknown) {
  const text = JSON.stringify(payload, null, 2);
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: payload as Record<string, unknown>
  };
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }]
  };
}

const conditionalReadSchema = z.object({
  known_digest: z.string().regex(/^[0-9a-f]{64}$/i).optional(),
  cache_max_age_ms: z.number().int().min(0).max(300000).optional()
});

function cacheMetadata(result: Awaited<ReturnType<ReturnType<typeof createConditionalReadCache>["run"]>>) {
  return {
    result_digest_sha256: result.resultDigestSha256,
    result_bytes: result.resultBytes,
    result_chars: result.resultChars,
    returned_chars: result.returnedChars,
    not_modified: result.notModified,
    result_suppressed: result.resultSuppressed,
    cache_hit: result.cacheHit,
    execution_skipped: result.executionSkipped,
    cache_age_ms: result.cacheAgeMs,
    content_retained: result.contentRetained
  };
}

function createClipStudioServer(): McpServer {
  const service = new ClipStudioService({
    exePath: requiredEnv("CLIPSTUDIO_MCP_EXE"),
    helperPath: process.env.CLIPSTUDIO_MCP_HELPER || "scripts/clipstudio-win.ps1",
    captureDir: process.env.CLIPSTUDIO_MCP_CAPTURE_DIR || "runtime/clipstudio-captures",
    powershellPath: process.env.CLIPSTUDIO_MCP_POWERSHELL || "powershell.exe",
    timeoutMs: numericEnv("CLIPSTUDIO_MCP_TIMEOUT_MS", 15000)
  });
  const statusCache = createConditionalReadCache({ maxEntries: 4, maxCacheAgeMs: 300000 });
  const server = new McpServer({ name: "vgate-clipstudio", version: "0.1.0" });

  server.registerTool("application_status", {
    description: "Report the configured CLIP STUDIO PAINT executable version, live process/window state, and foreground status. Supports SHA-256 conditional reads and digest-only TTL caching.",
    inputSchema: conditionalReadSchema
  }, async (args) => {
    try {
      let payload: Record<string, unknown> | undefined;
      const result = await statusCache.run({
        cacheKey: "clipstudio:application_status:v1",
        knownDigest: args.known_digest,
        cacheMaxAgeMs: args.cache_max_age_ms ?? 0,
        execute: async () => {
          payload = await service.applicationStatus();
          return JSON.stringify(payload, null, 2);
        }
      });
      const metadata = cacheMetadata(result);
      if (result.notModified) return success(metadata);
      return success({ ...(payload ?? {}), ...metadata });
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool("application_launch", {
    description: "Launch the configured CLIP STUDIO PAINT executable if it is not already running.",
    inputSchema: z.object({})
  }, async () => {
    try { statusCache.clear(); return success(await service.launch()); } catch (error) { return failure(error); }
  });

  server.registerTool("application_focus", {
    description: "Restore and focus the current CLIP STUDIO PAINT main window.",
    inputSchema: z.object({})
  }, async () => {
    try { statusCache.clear(); return success(await service.focus()); } catch (error) { return failure(error); }
  });

  server.registerTool("open_file", {
    description: "Open an existing absolute-path file in CLIP STUDIO PAINT.",
    inputSchema: z.object({ filePath: z.string().min(1) })
  }, async ({ filePath }) => {
    try { statusCache.clear(); return success(await service.openFile(filePath)); } catch (error) { return failure(error); }
  });

  server.registerTool("save_document", {
    description: "Save the active CLIP STUDIO PAINT document using Ctrl+S.",
    inputSchema: z.object({})
  }, async () => {
    try { return success(await service.save()); } catch (error) { return failure(error); }
  });

  server.registerTool("undo", {
    description: "Undo the last CLIP STUDIO PAINT operation using Ctrl+Z.",
    inputSchema: z.object({})
  }, async () => {
    try { return success(await service.undo()); } catch (error) { return failure(error); }
  });

  server.registerTool("redo", {
    description: "Redo the last CLIP STUDIO PAINT operation using Ctrl+Y.",
    inputSchema: z.object({})
  }, async () => {
    try { return success(await service.redo()); } catch (error) { return failure(error); }
  });

  server.registerTool("key_press", {
    description: "Press one allowlisted key on the guarded foreground CLIP STUDIO PAINT window.",
    inputSchema: z.object({ key: z.string().min(1).max(32) })
  }, async ({ key }) => {
    try { return success(await service.keyPress(key)); } catch (error) { return failure(error); }
  });

  server.registerTool("shortcut", {
    description: "Press an allowlisted key combination on the guarded foreground CLIP STUDIO PAINT window.",
    inputSchema: z.object({ keys: z.array(z.string().min(1).max(32)).min(1).max(8) })
  }, async ({ keys }) => {
    try { return success(await service.shortcut(keys)); } catch (error) { return failure(error); }
  });

  server.registerTool("mouse_click", {
    description: "Click within the current CLIP STUDIO PAINT main-window rectangle. Coordinates outside the guarded window are rejected.",
    inputSchema: z.object({
      x: z.number().int(),
      y: z.number().int(),
      button: z.enum(["left", "right", "middle"]).optional(),
      clicks: z.number().int().min(1).max(3).optional()
    })
  }, async (input) => {
    try { return success(await service.mouseClick(input)); } catch (error) { return failure(error); }
  });

  server.registerTool("mouse_scroll", {
    description: "Send a guarded vertical mouse-wheel delta within the current CLIP STUDIO PAINT main-window rectangle.",
    inputSchema: z.object({
      x: z.number().int(),
      y: z.number().int(),
      delta: z.number().int().min(-12000).max(12000)
    })
  }, async (input) => {
    try { return success(await service.mouseScroll(input)); } catch (error) { return failure(error); }
  });

  server.registerTool("capture_window", {
    description: "Capture the visible CLIP STUDIO PAINT main-window rectangle to PNG. File-backed output is default; inline image data is opt-in to limit MCP payload size.",
    inputSchema: z.object({
      resultMode: z.enum(["file", "inline"]).default("file"),
      maxBytes: z.number().int().min(1024).max(20000000).default(4000000)
    })
  }, async ({ resultMode, maxBytes }) => {
    try {
      const result = await service.captureWindow(resultMode, maxBytes);
      if (result.mode === "inline") {
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result.metadata, null, 2) },
            { type: "image" as const, data: result.data, mimeType: result.mimeType }
          ],
          structuredContent: result.metadata
        };
      }
      return success(result.metadata);
    } catch (error) {
      return failure(error);
    }
  });

  return server;
}

await serveStdio(() => createClipStudioServer());
