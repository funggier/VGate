import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { describe, expect, test } from "vitest";
import { parseGatewayConfig } from "../src/config.js";
import { ProviderManager } from "../src/providers/manager.js";
import { startGatewayHttp } from "../src/server-http.js";

describe("VGate upstream Streamable HTTP", () => {
  test("serves the federated gateway through a real localhost HTTP listener", async () => {
    const manager = new ProviderManager(parseGatewayConfig({
      version: 1,
      providers: {
        fixture: {
          transport: "stdio",
          command: process.execPath,
          args: ["--import", "tsx", "tests/fixtures/stdio-provider.ts"],
          timeoutMs: 3000
        }
      }
    }));
    await manager.connectAll();
    const http = await startGatewayHttp(manager, {
      host: "127.0.0.1",
      port: 0,
      path: "/mcp"
    });
    const client = new Client(
      { name: "vgate-http-e2e", version: "1.0.0" },
      { versionNegotiation: { mode: "auto", probe: { timeoutMs: 1000 } } }
    );

    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(http.url)), { timeout: 5000 });
      const tools = await client.listTools(undefined, { timeout: 5000 });
      expect(tools.tools.map((tool) => tool.name)).toContain("fixture__echo");
      const result = await client.callTool(
        { name: "fixture__echo", arguments: { text: "http-gateway" } },
        { timeout: 5000 }
      );
      expect(result.content).toContainEqual({ type: "text", text: "echo:http-gateway" });
    } finally {
      await client.close();
      await http.close();
      await manager.close();
    }
  }, 10000);
});
