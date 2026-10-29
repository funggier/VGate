import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import type { GatewayConfig } from "./config.js";

type ProviderId = "roblox" | "blender" | "unity" | "godot" | "monogame" | "clipstudio";
type Values = Record<string, string | number>;
export interface MachineProviderRecord { enabled: boolean; values: Values }
export type MachineProviderRecords = Partial<Record<ProviderId, MachineProviderRecord>>;
interface RegistryFile { version: 1; providers: MachineProviderRecords }

export const providerSettingCatalog: Record<ProviderId, { description: string; fields: string[]; discovery: string }> = {
  roblox: {
    description: "Roblox Studio launcher detects the installed Studio version automatically.",
    fields: [],
    discovery: "Launcher resolves installed Roblox Studio; only enable/forget is managed here."
  },
  blender: {
    description: "Blender MCP bridge on a loopback interface; the Blender addon must be enabled.",
    fields: ["host", "port"],
    discovery: "Bridge host/port are configured by the Blender MCP addon; port is not auto-guessed."
  },
  unity: {
    description: "Unity MCP editor bridge is discovered by its own connector.",
    fields: [],
    discovery: "Unity MCP package discovers its editor bridge; only enable/forget is managed here."
  },
  godot: {
    description: "Godot MCP project selection. Editor toolkit must still be enabled.",
    fields: ["projectPath"],
    discovery: "Supply the absolute directory of the target Godot project."
  },
  monogame: {
    description: "MonoGame provider workspace restriction.",
    fields: ["allowedRoot"],
    discovery: "Supply an existing project parent directory."
  },
  clipstudio: {
    description: "CLIP STUDIO PAINT application executable.",
    fields: ["executablePath"],
    discovery: "The running CLIPStudioPaint.exe can be detected automatically on Windows."
  }
};

function providerId(value: string): ProviderId {
  if (!Object.prototype.hasOwnProperty.call(providerSettingCatalog, value)) {
    throw new Error("Unsupported provider: " + value);
  }
  return value as ProviderId;
}

async function validatePath(value: unknown, type: "file" | "directory", filename?: string): Promise<string> {
  if (typeof value !== "string" || !value.trim() || !resolve(value)) {
    throw new Error("Expected an absolute " + type + " path.");
  }
  const path = value.trim();
  const isWindowsAbsolute = /^[a-zA-Z]:[\\/]/.test(path) || /^\\\\[^\\]+\\[^\\]+/.test(path);
  const isPosixAbsolute = path.startsWith("/");
  if (!isWindowsAbsolute && !isPosixAbsolute) throw new Error("Expected an absolute " + type + " path.");
  if (filename && basename(path).toLowerCase() !== filename.toLowerCase()) {
    throw new Error("Executable must be named " + filename + ".");
  }
  const info = await stat(path).catch(() => null);
  if (type === "file" && !info?.isFile()) throw new Error("Executable file does not exist: " + path);
  if (type === "directory" && !info?.isDirectory()) throw new Error("Directory does not exist: " + path);
  return resolve(path);
}

async function validateValues(id: ProviderId, input: Record<string, unknown>): Promise<Values> {
  const allowed = new Set(providerSettingCatalog[id].fields);
  for (const name of Object.keys(input)) {
    if (!allowed.has(name)) throw new Error("Unsupported setting for " + id + ": " + name);
  }
  switch (id) {
    case "clipstudio":
      if (typeof input.executablePath !== "string") throw new Error("executablePath is required.");
      return { executablePath: await validatePath(input.executablePath, "file", "CLIPStudioPaint.exe") };
    case "monogame":
      if (typeof input.allowedRoot !== "string") throw new Error("allowedRoot is required.");
      return { allowedRoot: await validatePath(input.allowedRoot, "directory") };
    case "godot":
      if (typeof input.projectPath !== "string") throw new Error("projectPath is required.");
      return { projectPath: await validatePath(input.projectPath, "directory") };
    case "blender": {
      const host = input.host ?? "127.0.0.1";
      if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
        throw new Error("Blender bridge host must be loopback (localhost).");
      }
      const port = input.port ?? 9876;
      if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error("Blender bridge port must be an integer from 1 to 65535.");
      }
      return { host: String(host), port };
    }
    case "unity":
    case "roblox":
      return {};
  }
}

function checkedRegistry(input: unknown): MachineProviderRecords {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid provider registry.");
  const raw = input as Record<string, unknown>;
  if (raw.version !== 1 || !raw.providers || typeof raw.providers !== "object" || Array.isArray(raw.providers)) {
    throw new Error("Unsupported provider registry format/version.");
  }
  const providers = raw.providers as Record<string, unknown>;
  const result: MachineProviderRecords = {};
  for (const [id, record] of Object.entries(providers)) {
    providerId(id);
    if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("Invalid provider record.");
    const entry = record as Record<string, unknown>;
    if (typeof entry.enabled !== "boolean" || !entry.values || typeof entry.values !== "object" || Array.isArray(entry.values)) {
      throw new Error("Invalid provider settings for " + id);
    }
    const values = entry.values as Record<string, unknown>;
    for (const [key, value] of Object.entries(values)) {
      if (!providerSettingCatalog[id as ProviderId].fields.includes(key) || (typeof value !== "number" && typeof value !== "string")) {
        throw new Error("Invalid persisted provider setting for " + id + ": " + key);
      }
    }
    result[id as ProviderId] = { enabled: entry.enabled, values: values as Values };
  }
  return result;
}

export class MachineProviderRegistry {
  constructor(readonly filePath: string) {}

  async list(): Promise<MachineProviderRecords> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
    return checkedRegistry(JSON.parse(raw.replace(/^\uFEFF/, "")));
  }

  private async persist(data: MachineProviderRecords): Promise<void> {
    const parent = dirname(this.filePath);
    await mkdir(parent, { recursive: true });
    const temp = this.filePath + "." + randomUUID() + ".tmp";
    try {
      await writeFile(temp, JSON.stringify({ version: 1, providers: data } satisfies RegistryFile, null, 2) + "\n", {
        encoding: "utf8", mode: 0o600, flag: "wx"
      });
      await rename(temp, this.filePath);
    } finally {
      await rm(temp, { force: true }).catch(() => {});
    }
  }

  async save(provider: string, input: Record<string, unknown>): Promise<MachineProviderRecord> {
    const id = providerId(provider);
    const values = await validateValues(id, input);
    const data = await this.list();
    const record = { enabled: true, values };
    data[id] = record;
    await this.persist(data);
    return record;
  }

  async forget(provider: string): Promise<MachineProviderRecord> {
    const id = providerId(provider);
    const data = await this.list();
    // Explicit disabled tombstone prevents older vgate.local.json values from silently reconnecting.
    const record = { enabled: false, values: {} };
    data[id] = record;
    await this.persist(data);
    return record;
  }
}

export function mergeManagedProviderConfig(config: GatewayConfig, saved: MachineProviderRecords): GatewayConfig {
  const copy: GatewayConfig = structuredClone(config);
  for (const [id, entry] of Object.entries(saved)) {
    if (!entry || !copy.providers[id]) continue;
    const provider = copy.providers[id];
    if (!entry.enabled) {
      provider.enabled = false;
      continue;
    }
    provider.enabled = true;
    if (provider.transport !== "stdio") continue;
    const values = entry.values;
    switch (id) {
      case "clipstudio":
        if (typeof values.executablePath === "string") provider.env.CLIPSTUDIO_MCP_EXE = values.executablePath;
        break;
      case "monogame":
        if (typeof values.allowedRoot === "string") provider.env.MONOGAME_MCP_ALLOWED_ROOT = values.allowedRoot;
        break;
      case "godot":
        if (typeof values.projectPath === "string") provider.env.GODOT_MCP_PROJECT_PATH = values.projectPath;
        break;
      case "blender":
        if (typeof values.host === "string") provider.env.BLENDER_MCP_HOST = values.host;
        if (typeof values.port === "number") provider.env.BLENDER_MCP_PORT = String(values.port);
        break;
    }
  }
  return copy;
}
