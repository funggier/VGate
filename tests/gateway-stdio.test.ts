import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { describe, expect, test } from "vitest";

describe("VGate upstream stdio", () => {
  test("exports control tools and routes a downstream tool end to end", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", "src/server-stdio.ts"],
      cwd: process.cwd(),
      env: {
        ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
        VGATE_CONFIG: "tests/fixtures/gateway-config.json",
        VGATE_TEST_NODE: process.execPath
      }
    });
    const client = new Client(
      { name: "vgate-e2e-test", version: "1.0.0" },
      { versionNegotiation: { mode: "auto", probe: { timeoutMs: 1000 } } }
    );

    try {
      await client.connect(transport, { timeout: 5000 });
      const listed = await client.listTools(undefined, { timeout: 5000 });
      const names = listed.tools.map((tool) => tool.name);
      expect(names).toContain("vgate_status");
      expect(names).toContain("vgate_list_providers");
      expect(names).toContain("vgate_refresh");
      expect(names).toContain("fixture__echo");

      const echoed = await client.callTool(
        { name: "fixture__echo", arguments: { text: "gateway" } },
        { timeout: 5000 }
      );
      expect(echoed.content).toContainEqual({ type: "text", text: "echo:gateway" });

      const prompts = await client.listPrompts(undefined, { timeout: 5000 });
      expect(prompts.prompts.map((prompt) => prompt.name)).toContain("fixture__greet");
      const greeting = await client.getPrompt(
        { name: "fixture__greet", arguments: { name: "VGate" } },
        { timeout: 5000 }
      );
      expect(greeting.messages).toContainEqual({
        role: "user",
        content: { type: "text", text: "Hello VGate" }
      });

      const resources = await client.listResources(undefined, { timeout: 5000 });
      const about = resources.resources.find((resource) => resource.name === "fixture__about");
      expect(about?.uri).toMatch(/^vgate:\/\/fixture\//);
      const resource = await client.readResource({ uri: about!.uri }, { timeout: 5000 });
      expect(resource.contents).toContainEqual(expect.objectContaining({
        uri: about!.uri,
        text: "fixture-resource"
      }));

      const status = await client.callTool({ name: "vgate_status", arguments: {} }, { timeout: 5000 });
      expect(status.structuredContent).toMatchObject({
        providers: {
          fixture: {
            state: "ready",
            transport: "stdio",
            toolCount: 2,
            promptCount: 1,
            resourceCount: 1
          }
        },
        not_modified: false,
        cache_hit: false,
        execution_skipped: false
      });
      const digest = String((status.structuredContent as Record<string, unknown>).result_digest_sha256 ?? "");
      expect(digest).toMatch(/^[0-9a-f]{64}$/);

      const cached = await client.callTool({
        name: "vgate_status",
        arguments: { known_digest: digest, cache_max_age_ms: 60000 }
      }, { timeout: 5000 });
      expect(cached.structuredContent).toMatchObject({
        result_digest_sha256: digest,
        not_modified: true,
        result_suppressed: true,
        cache_hit: true,
        execution_skipped: true
      });
      expect(cached.structuredContent).not.toHaveProperty("providers");

      const revalidated = await client.callTool({
        name: "vgate_status",
        arguments: { known_digest: digest, cache_max_age_ms: 0 }
      }, { timeout: 5000 });
      expect(revalidated.structuredContent).toMatchObject({
        result_digest_sha256: digest,
        not_modified: true,
        result_suppressed: true,
        cache_hit: false,
        execution_skipped: false
      });

      await client.callTool({ name: "vgate_refresh", arguments: {} }, { timeout: 5000 });
      const afterRefresh = await client.callTool({
        name: "vgate_status",
        arguments: { known_digest: digest, cache_max_age_ms: 60000 }
      }, { timeout: 5000 });
      expect(afterRefresh.structuredContent).toMatchObject({
        result_digest_sha256: digest,
        not_modified: true,
        cache_hit: false,
        execution_skipped: false
      });
    } finally {
      await client.close();
    }
  }, 15000);
});
