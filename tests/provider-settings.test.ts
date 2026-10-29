import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";
import { parseGatewayConfig } from "../src/config.js";
import {
  MachineProviderRegistry,
  mergeManagedProviderConfig,
  providerSettingCatalog
} from "../src/provider-settings.js";

const base = () => parseGatewayConfig({
  version: 1,
  activeProfile: "game-dev",
  profiles: { "game-dev": { providers: ["clipstudio", "monogame", "blender", "unity", "godot", "roblox"] } },
  providers: {
    clipstudio: { transport: "stdio", command: "node", args: ["dist/providers/clipstudio/server.js"], env: { CLIPSTUDIO_MCP_EXE: "" } },
    monogame: { transport: "stdio", command: "node", args: ["dist/providers/monogame/server.js"], env: {} },
    blender: { transport: "stdio", command: "uvx", args: ["blender-mcp"], env: { BLENDER_MCP_PORT: "9876" } },
    unity: { transport: "stdio", command: "uvx", args: ["unity-server"] },
    godot: { transport: "stdio", command: "npx", args: ["godot"], env: {} },
    roblox: { transport: "stdio", command: "node", args: ["launcher.js"] }
  }
});

describe("per-machine MCP provider settings", () => {
  test("persists configured Clip Studio path and loads it in another registry instance", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vgate-machine-"));
    const exe = join(dir, "CLIPStudioPaint.exe");
    await writeFile(exe, "fixture");
    const path = join(dir, "local-secrets", "provider-connections.json");
    try {
      const store = new MachineProviderRegistry(path);
      await store.save("clipstudio", { executablePath: exe });
      const second = new MachineProviderRegistry(path);
      const loaded = await second.list();
      expect(loaded.clipstudio?.values.executablePath).toBe(exe);
      const config = mergeManagedProviderConfig(base(), loaded);
      expect(config.providers.clipstudio.transport).toBe("stdio");
      if(config.providers.clipstudio.transport === "stdio") {
        expect(config.providers.clipstudio.command).toBe("node");
        expect(config.providers.clipstudio.env.CLIPSTUDIO_MCP_EXE).toBe(exe);
      }
    } finally { await rm(dir, {recursive:true,force:true}); }
  });

  test("forget removes path and disables provider even when base config has a machine-specific fallback", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vgate-forget-"));
    const exe = join(dir, "CLIPStudioPaint.exe");
    await writeFile(exe, "");
    const path = join(dir, "provider-connections.json");
    try {
      const store = new MachineProviderRegistry(path);
      await store.save("clipstudio", { executablePath: exe });
      await store.forget("clipstudio");
      const saved = await new MachineProviderRegistry(path).list();
      expect(saved.clipstudio).toEqual({ enabled: false, values: {} });
      const cfg=base();
      if(cfg.providers.clipstudio.transport==="stdio") cfg.providers.clipstudio.env.CLIPSTUDIO_MCP_EXE="C:\\old\\CLIPStudioPaint.exe";
      expect(mergeManagedProviderConfig(cfg,saved).providers.clipstudio.enabled).toBe(false);
    } finally { await rm(dir, {recursive:true,force:true}); }
  });

  test("accepts only typed settings for known providers; cannot replace MCP command or inject env", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vgate-guard-"));
    const store = new MachineProviderRegistry(join(dir, "provider-connections.json"));
    try {
      expect(Object.keys(providerSettingCatalog).sort()).toEqual(["blender","clipstudio","godot","monogame","roblox","unity"]);
      await expect(store.save("evil", { executablePath: "anything" })).rejects.toThrow(/unsupported/i);
      await expect(store.save("blender", { command: "powershell.exe" })).rejects.toThrow(/unsupported|invalid/i);
      await expect(store.save("blender", { host: "10.0.0.4", port: 9876 })).rejects.toThrow(/loopback/i);
      await expect(store.save("blender", { host: "127.0.0.1", port: 70000 })).rejects.toThrow(/port/i);
      await expect(store.save("blender", { host: "127.0.0.1", port: 9888 })).resolves.toBeDefined();
      expect((await store.list()).blender?.values).toEqual({ host: "127.0.0.1", port: 9888 });
    } finally { await rm(dir, {recursive:true,force:true}); }
  });

  test("rejects non-existent program and invalid root; never writes unsafe values", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vgate-path-"));
    const store = new MachineProviderRegistry(join(dir, "secrets", "provider-connections.json"));
    try {
      await expect(store.save("clipstudio", { executablePath: join(dir, "CLIPStudioPaint.exe") })).rejects.toThrow(/file/i);
      await expect(store.save("monogame", { allowedRoot: join(dir, "missing") })).rejects.toThrow(/directory/i);
      await expect(store.save("godot", { projectPath: join(dir, "missing") })).rejects.toThrow(/directory/i);
      expect(await store.list()).toEqual({});
    } finally { await rm(dir, {recursive:true,force:true}); }
  });

  test("does not overwrite unrelated entries and rejects a corrupted settings registry", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vgate-registry-"));
    const path = join(dir, "provider-connections.json");
    try {
      const store = new MachineProviderRegistry(path);
      await store.save("blender", { host: "localhost", port: 9876 });
      await store.save("unity", {});
      expect(Object.keys(await store.list()).sort()).toEqual(["blender","unity"]);
      await writeFile(path, "{ corrupt");
      await expect(store.list()).rejects.toThrow();
    } finally { await rm(dir, {recursive:true,force:true}); }
  });
});