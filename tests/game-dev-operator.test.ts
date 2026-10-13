import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { parseGatewayConfig, selectProviders } from "../src/config.js";

describe("game-dev provider example", () => {
  test("includes pinned Godot MCP alongside Roblox, Blender and Unity", async () => {
    const raw = JSON.parse(await readFile("config/vgate.example.json", "utf8"));
    const config = parseGatewayConfig(raw);
    expect(config.activeProfile).toBe("game-dev");
    expect(config.profiles["game-dev"]?.providers).toEqual([
      "roblox",
      "blender",
      "unity",
      "godot"
    ]);
    expect(selectProviders(config).map(([id]) => id)).toEqual([
      "roblox",
      "blender",
      "unity",
      "godot"
    ]);
    expect(config.providers.godot).toMatchObject({
      transport: "stdio",
      command: "npx",
      args: ["-y", "@npgamedev/godot-mcp-server@1.0.3"],
      timeoutMs: 60000,
      toolPolicy: { default: "allow" }
    });
  });
});

describe("Windows operator wrappers", () => {
  test.each(["Status-VGate.cmd", "Stop-VGate.cmd"])("%s has readable hold and automation bypass", async (name) => {
    const text = await readFile(name, "utf8");
    expect(text).toContain("--no-hold");
    expect(text).toContain("Hold-VGateConsole.ps1");
    expect(text).not.toMatch(/^\s*pause\s*$/im);
  });

  test("hold helper drains buffered keys and has bounded fallback", async () => {
    const text = await readFile("scripts/Hold-VGateConsole.ps1", "utf8");
    expect(text).toContain("[Console]::KeyAvailable");
    expect(text).toContain("[Console]::ReadKey");
    expect(text).toContain("FallbackSeconds = 15");
    expect(text).toContain("keeping this result visible");
  });
});
