import { createServer } from "node:http";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { localhostHostValidation, localhostOriginValidation, toNodeHandler } from "@modelcontextprotocol/node";
import * as z from "zod/v4";
import { describe, expect, test } from "vitest";
import { parseGatewayConfig } from "../src/config.js";
import { ProviderManager } from "../src/providers/manager.js";

describe("ProviderManager Streamable HTTP", () => {
  test("discovers and routes a real HTTP MCP provider", async () => {
    const handler = createMcpHandler(() => {
      const server = new McpServer({ name: "fixture-http", version: "1.0.0" });
      server.registerTool("upper", {
        inputSchema: z.object({ text: z.string() })
      }, async ({ text }) => ({
        content: [{ type: "text", text: text.toUpperCase() }]
      }));
      return server;
    });
    const nodeHandler = toNodeHandler(handler);
    const validateHost = localhostHostValidation();
    const validateOrigin = localhostOriginValidation();
    const httpServer = createServer((req, res) => {
      if (!validateHost(req, res) || !validateOrigin(req, res)) return;
      void nodeHandler(req, res);
    });
    await new Promise<void>((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(0, "127.0.0.1", () => resolve());
    });
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");

    const manager = new ProviderManager(parseGatewayConfig({
      version: 1,
      providers: {
        web: {
          transport: "http",
          url: "http://127.0.0.1:" + address.port + "/mcp"
        }
      }
    }));

    try {
      await manager.connectAll();
      expect(manager.snapshot().providers.web.state).toBe("ready");
      expect(manager.listTools().map((tool) => tool.upstreamName)).toEqual(["web__upper"]);
      const result = await manager.callTool("web__upper", { text: "gateway" });
      expect(result.content).toContainEqual({ type: "text", text: "GATEWAY" });
    } finally {
      await manager.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  }, 15000);
});
