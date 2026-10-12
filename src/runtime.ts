import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { parseGatewayConfig, loadGatewayConfig, type GatewayConfig } from "./config.js";

export async function resolveConfigPath(): Promise<string | null> {
  const candidate = resolve(process.env.VGATE_CONFIG ?? "vgate.local.json");
  try {
    await access(candidate);
    return candidate;
  } catch {
    return null;
  }
}

export async function loadRuntimeConfig(): Promise<GatewayConfig> {
  const path = await resolveConfigPath();
  if (!path) return parseGatewayConfig({ version: 1, providers: {} });
  return loadGatewayConfig(path);
}

export function logDiagnostic(message: string, details?: unknown): void {
  const suffix = details === undefined ? "" : " " + (typeof details === "string" ? details : JSON.stringify(details));
  process.stderr.write("[VGate] " + message + suffix + "\n");
}
