import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";
import { parseGatewayConfig } from "../src/config.js";
import { MachineProviderRegistry } from "../src/provider-settings.js";
import { ProviderConnectionController } from "../src/provider-connections.js";
import { ProviderManager } from "../src/providers/manager.js";

describe("live machine provider connection management", () => {
  test("connects after saved path, persists after restart, and forget disconnects without resetting other providers", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vgate-live-"));
    const exe = join(dir, "CLIPStudioPaint.exe");
    await writeFile(exe, "fixture");
    const registry = new MachineProviderRegistry(join(dir, "local-secrets", "provider-connections.json"));
    const base = parseGatewayConfig({
      version: 1,
      providers: {
        fixture: { transport: "stdio", command: process.execPath, args: ["--import","tsx","tests/fixtures/stdio-provider.ts"] },
        clipstudio: {
          transport: "stdio",
          command: process.execPath,
          args: ["--import","tsx","tests/fixtures/stdio-provider.ts"],
          env: { CLIPSTUDIO_MCP_EXE: "${env:CLIPSTUDIO_MCP_EXE}" }
        }
      }
    });
    const manager = new ProviderManager(base);
    const controller = new ProviderConnectionController(base, manager, registry);
    try {
      await manager.connectAll();
      expect(manager.snapshot().providers.fixture.state).toBe("ready");
      expect(manager.snapshot().providers.clipstudio.state).toBe("disabled");
      await controller.configure("clipstudio", { executablePath: exe });
      expect(manager.snapshot().providers.clipstudio.state).toBe("ready");
      expect(manager.listTools().map(x=>x.upstreamName)).toContain("clipstudio__echo");
      const afterRestart = new ProviderConnectionController(base, manager, new MachineProviderRegistry(registry.filePath));
      expect((await afterRestart.list()).saved.clipstudio?.values.executablePath).toBe(exe);
      await controller.forget("clipstudio");
      expect(manager.snapshot().providers.clipstudio.state).toBe("disabled");
      expect(manager.snapshot().providers.fixture.state).toBe("ready");
      expect(manager.listTools().map(x=>x.upstreamName)).not.toContain("clipstudio__echo");
      expect((await new MachineProviderRegistry(registry.filePath).list()).clipstudio?.enabled).toBe(false);
    } finally {
      await manager.close();
      await rm(dir,{recursive:true,force:true});
    }
  }, 15000);
});
