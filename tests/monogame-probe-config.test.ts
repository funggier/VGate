import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { parseGatewayConfig, selectProviders } from "../src/config.js";

describe("MonoGame isolated probe config", () => {
  test("launches only the built MonoGame provider and keeps the project root machine-local", async () => {
    const raw = JSON.parse(await readFile("config/vgate.monogame.probe.example.json", "utf8"));
    const config = parseGatewayConfig(raw);
    expect(config.activeProfile).toBe("monogame-probe");
    const selected = selectProviders(config, { MONOGAME_MCP_ALLOWED_ROOT: "N:\\WorkSpace\\MonoGameProject" });
    expect(selected).toHaveLength(1);
    expect(selected[0]?.[0]).toBe("monogame");
    expect(selected[0]?.[1]).toMatchObject({
      transport: "stdio",
      command: "node",
      args: ["dist/providers/monogame/server.js"],
      env: { MONOGAME_MCP_ALLOWED_ROOT: "N:\\WorkSpace\\MonoGameProject" }
    });
    expect(JSON.stringify(raw)).not.toContain("N:\\WorkSpace");
  });
});