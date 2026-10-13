import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { parseGatewayConfig } from "../src/config.js";
import { ProviderManager } from "../src/providers/manager.js";

function providerArgs(): string[] {
  return ["--import", "tsx", "src/providers/monogame/server.ts"];
}

describe("dedicated MonoGame MCP provider", () => {
  test("exposes exactly seven bounded tools and handles project errors without dying", async () => {
    const root = await mkdtemp(join(tmpdir(), "vgate-monogame-provider-"));
    const game = join(root, "Game");
    await mkdir(game, { recursive: true });
    await writeFile(join(game, "Game.csproj"), '<Project><PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup><ItemGroup><PackageReference Include="MonoGame.Framework.DesktopGL" Version="3.8.6" /></ItemGroup></Project>');

    const manager = new ProviderManager(parseGatewayConfig({
      version: 1,
      providers: {
        monogame: {
          transport: "stdio",
          command: process.execPath,
          args: providerArgs(),
          env: { MONOGAME_MCP_ALLOWED_ROOT: root },
          timeoutMs: 10000
        }
      }
    }));

    try {
      await manager.connectAll();
      expect(manager.snapshot().providers.monogame).toMatchObject({ state: "ready", toolCount: 7 });
      expect(manager.listTools().map((tool) => tool.upstreamName)).toEqual([
        "monogame__content_build",
        "monogame__content_inspect",
        "monogame__environment_status",
        "monogame__project_build",
        "monogame__project_create",
        "monogame__project_inspect",
        "monogame__project_run"
      ]);

      const status = await manager.callTool("monogame__environment_status", {});
      expect(status.isError).not.toBe(true);
      expect(status.structuredContent).toHaveProperty("dotnetVersion");

      const inspected = await manager.callTool("monogame__project_inspect", { projectPath: game });
      expect(inspected.isError).not.toBe(true);
      expect(inspected.structuredContent.projects).toHaveLength(1);

      const missing = await manager.callTool("monogame__project_inspect", { projectPath: join(root, "Missing") });
      expect(missing.isError).toBe(true);
      expect(missing.content?.[0]?.text).toMatch(/project/i);

      const statusAfter = manager.snapshot().providers.monogame;
      expect(statusAfter.state).toBe("ready");
    } finally {
      await manager.close();
      await rm(root, { recursive: true, force: true });
    }
  }, 20000);
});