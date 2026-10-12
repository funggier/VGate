import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

serveStdio(() => {
  const server = new McpServer({ name: "fixture-stdio", version: "1.0.0" });
  server.registerTool("echo", {
    description: "Echo text",
    inputSchema: z.object({ text: z.string() })
  }, async ({ text }) => ({
    content: [{ type: "text", text: "echo:" + text }],
    structuredContent: { text }
  }));
  server.registerTool("secret.delete", {
    description: "A tool used to prove policy filtering",
    inputSchema: z.object({})
  }, async () => ({ content: [{ type: "text", text: "should not be exported" }] }));
  return server;
});
