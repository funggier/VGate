import { describe, expect, test } from "vitest";
import { parseGatewayConfig } from "../src/config.js";
import { ProviderManager } from "../src/providers/manager.js";

function providerArgs(): string[] {
  return ["--import", "tsx", "src/providers/clipstudio/server.ts"];
}

describe("dedicated CLIP STUDIO PAINT MCP provider", () => {
  test("exposes the bounded Windows-control surface without requiring the application at discovery time", async () => {
    const manager = new ProviderManager(parseGatewayConfig({
      version: 1,
      providers: {
        clipstudio: {
          transport: "stdio",
          command: process.execPath,
          args: providerArgs(),
          env: {
            CLIPSTUDIO_MCP_EXE: "C:\\Program Files\\CELSYS\\CLIPStudioPaint.exe",
            CLIPSTUDIO_MCP_HELPER: "scripts/clipstudio-win.ps1",
            CLIPSTUDIO_MCP_CAPTURE_DIR: "runtime/clipstudio-captures"
          },
          timeoutMs: 10000
        }
      }
    }));

    try {
      await manager.connectAll();
      expect(manager.snapshot().providers.clipstudio).toMatchObject({ state: "ready", toolCount: 12 });
      expect(manager.listTools().map((tool) => tool.upstreamName)).toEqual([
        "clipstudio__application_focus",
        "clipstudio__application_launch",
        "clipstudio__application_status",
        "clipstudio__capture_window",
        "clipstudio__key_press",
        "clipstudio__mouse_click",
        "clipstudio__mouse_scroll",
        "clipstudio__open_file",
        "clipstudio__redo",
        "clipstudio__save_document",
        "clipstudio__shortcut",
        "clipstudio__undo"
      ]);
    } finally {
      await manager.close();
    }
  }, 20000);
});
