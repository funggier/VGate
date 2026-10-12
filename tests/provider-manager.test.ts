import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import * as z from "zod/v4";
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
        broken: { transport: "stdio", command: process.execPath, args: ["--import", "tsx", "tests/fixtures/broken-provider.ts"] }
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

  test("times out a silent provider using provider timeoutMs", async () => {
    const manager = new ProviderManager(parseGatewayConfig({
      version: 1,
      providers: {
        silent: {
          transport: "stdio",
          command: process.execPath,
          args: ["--import", "tsx", "tests/fixtures/silent-provider.ts"],
          timeoutMs: 150
        }
      }
    }));
    const started = Date.now();
    try {
      await Promise.race([
        manager.connectAll(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("connectAll did not honor timeoutMs")), 900))
      ]);
      expect(Date.now() - started).toBeLessThan(900);
      expect(manager.snapshot().providers.silent.state).toBe("error");
    } finally {
      await manager.close();
    }
  }, 2000);

  test("rejects stale or unknown upstream routes", async () => {
    const manager = new ProviderManager(parseGatewayConfig({ version: 1, providers: {} }));
    await expect(manager.callTool("missing__tool", {})).rejects.toThrow(/route/i);
  });
});

describe("ProviderManager Streamable HTTP", () => {
  test("discovers and routes through a real localhost HTTP endpoint", async () => {
    const handler = createMcpHandler(() => {
      const server = new McpServer({ name: "fixture-http", version: "1.0.0" });
      server.registerTool("http_echo", {
        description: "Echo over Streamable HTTP",
        inputSchema: z.object({ text: z.string() })
      }, async ({ text }) => ({
        content: [{ type: "text", text: "http:" + text }],
        structuredContent: { text }
      }));
      return server;
    });
    const nodeHandler = toNodeHandler(handler);
    const httpServer = createServer((req, res) => {
      if (req.url !== "/mcp") {
        res.statusCode = 404;
        res.end();
        return;
      }
      void nodeHandler(req, res);
    });
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    const port = (httpServer.address() as AddressInfo).port;
    const manager = new ProviderManager(parseGatewayConfig({
      version: 1,
      providers: {
        web: {
          transport: "http",
          url: "http://127.0.0.1:" + port + "/mcp",
          timeoutMs: 2000
        }
      }
    }));

    try {
      await manager.connectAll();
      expect(manager.snapshot().providers.web.state).toBe("ready");
      expect(manager.listTools().map((tool) => tool.upstreamName)).toContain("web__http_echo");
      const result = await manager.callTool("web__http_echo", { text: "ok" });
      expect(result.content).toContainEqual({ type: "text", text: "http:ok" });
    } finally {
      await manager.close();
      await handler.close();
      await new Promise<void>((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
    }
  });
});
