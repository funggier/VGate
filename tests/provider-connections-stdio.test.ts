import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { describe, expect, test } from "vitest";

describe("persistent gateway provider administration over MCP", () => {
  test("configures, restores after a gateway restart, and forgets the local Clip Studio binding", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vgate-admin-e2e-"));
    const exe = join(dir, "CLIPStudioPaint.exe");
    const configPath = join(dir, "vgate.local.json");
    const registryPath = join(dir, "provider-connections.json");
    await writeFile(exe, "fake executable - never launched in this fixture");
    await writeFile(configPath, JSON.stringify({
      version:1,
      providers: {
        clipstudio: {
          transport:"stdio",
          command:process.execPath,
          args:["--import","tsx","tests/fixtures/stdio-provider.ts"],
          env:{CLIPSTUDIO_MCP_EXE:"${env:VGATE_E2E_UNDEFINED_EXE_9371}"}
        }
      }
    }));

    async function connect() {
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: ["--import","tsx","src/server-stdio.ts"],
        cwd: process.cwd(),
        env:{
          ...Object.fromEntries(Object.entries(process.env).filter((e):e is [string,string]=>typeof e[1]==="string")),
          VGATE_CONFIG: configPath,
          VGATE_PROVIDER_SETTINGS: registryPath
        }
      });
      const client = new Client({name:"vgate-provider-admin-e2e",version:"1.0.0"});
      await client.connect(transport,{timeout:5000});
      return client;
    }
    let client: Client | undefined;
    try {
      client = await connect();
      const before = await client.callTool({name:"vgate_status",arguments:{}},{timeout:5000});
      expect(before.structuredContent).toHaveProperty("providers.clipstudio.state","disabled");
      const configured = await client.callTool({
        name:"vgate_provider_configure",
        arguments:{provider:"clipstudio",executablePath:exe}
      },{timeout:10000});
      expect(configured.isError, JSON.stringify(configured.content)).not.toBe(true);
      const invoked = await client.callTool({
        name:"vgate_provider_invoke",
        arguments:{toolName:"clipstudio__echo", args:{text:"dynamic"}}
      },{timeout:5000});
      expect(invoked.content).toContainEqual({type:"text",text:"echo:dynamic"});
      const active = await client.callTool({name:"vgate_status",arguments:{}},{timeout:5000});
      expect(active.structuredContent).toHaveProperty("providers.clipstudio.state","ready");
      await client.close();

      client = await connect();
      const persisted = await client.callTool({name:"vgate_provider_connections",arguments:{}},{timeout:5000});
      expect(persisted.structuredContent).toHaveProperty("saved.clipstudio.values.executablePath", exe);
      const reconnected = await client.callTool({name:"vgate_status",arguments:{}},{timeout:5000});
      expect(reconnected.structuredContent).toHaveProperty("providers.clipstudio.state","ready");
      const forget = await client.callTool({
        name:"vgate_provider_forget",arguments:{provider:"clipstudio"}
      },{timeout:10000});
      expect(forget.isError).not.toBe(true);
      expect(forget.structuredContent).toHaveProperty("saved.enabled",false);
      await client.close();

      client = await connect();
      const inactive = await client.callTool({name:"vgate_status",arguments:{}},{timeout:5000});
      expect(inactive.structuredContent).toHaveProperty("providers.clipstudio.state","disabled");
    } finally {
      await client?.close();
      await rm(dir,{recursive:true,force:true});
    }
  },25000);
});