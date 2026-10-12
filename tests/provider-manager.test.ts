import { describe, expect, test } from "vitest";
import { parseGatewayConfig } from "../src/config.js";
import { ProviderManager } from "../src/providers/manager.js";

function fixtureArgs(): string[] {
  return ["--import", "tsx", "tests/fixtures/stdio-provider.ts"];
}

describe("ProviderManager stdio", () => {
  test("discovers and routes a real downstream tool", async () => {
    const manager = new ProviderManager(parseGatewayConfig({
      version: 1,
      providers: {
        fixture: {
          transport: "stdio",
          command: process.execPath,
          args: fixtureArgs(),
          toolPolicy: { default: "allow", deny: ["secret.*"] }
        }
      }
    }));
    try {
      await manager.connectAll();
      expect(manager.listTools().map((tool) => tool.upstreamName)).toEqual(["fixture__echo"]);
      const result = await manager.callTool("fixture__echo", { text: "hello" });
      expect(result.content).toContainEqual({ type: "text", text: "echo:hello" });
      expect(manager.snapshot().providers.fixture.state).toBe("ready");
    } finally {
      await manager.close();
    }
  });

  test("isolates a broken provider from a healthy provider", async () => {
    const manager = new ProviderManager(parseGatewayConfig({
      version: 1,
      providers: {
        good: { transport: "stdio", command: process.execPath, args: fixtureArgs() },
        broken: { transport: "stdio", command: process.execPath, args: ["definitely-missing-vgate-provider.js"] }
      }
    }));
    try {
      await manager.connectAll();
      expect(manager.listTools().some((tool) => tool.upstreamName === "good__echo")).toBe(true);
      expect(manager.snapshot().providers.good.state).toBe("ready");
      expect(manager.snapshot().providers.broken.state).toBe("error");
    } finally {
      await manager.close();
    }
  });

  test("rejects stale or unknown upstream routes", async () => {
    const manager = new ProviderManager(parseGatewayConfig({ version: 1, providers: {} }));
    await expect(manager.callTool("missing__tool", {})).rejects.toThrow(/route/i);
  });
});
