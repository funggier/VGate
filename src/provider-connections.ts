import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { stat } from "node:fs/promises";
import { mergeManagedProviderConfig, MachineProviderRegistry, providerSettingCatalog } from "./provider-settings.js";
import type { GatewayConfig } from "./config.js";
import type { ProviderManager } from "./providers/manager.js";

const execFileAsync = promisify(execFile);

export interface ProviderDiscoveryResult {
  provider: string;
  description: string;
  fields: string[];
  discovery: string;
  candidates: Array<Record<string, string>>;
  configured: boolean;
}

async function findInstalledClipStudio(): Promise<Array<Record<string, string>>> {
  if (process.platform !== "win32") return [];
  // Every probe is a fixed, allowlisted Windows query; no user-controlled commands or scripts.
  const script = [
    "$ErrorActionPreference='SilentlyContinue'",
    "$paths = New-Object System.Collections.Generic.List[string]",
    "Get-Process -Name 'CLIPStudioPaint' -ErrorAction SilentlyContinue | ForEach-Object { if ($_.Path) { $paths.Add($_.Path) } }",
    "$keys = @(",
    " 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\CLIPStudioPaint.exe',",
    " 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\CLIPStudioPaint.exe',",
    " 'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\CLIPStudioPaint.exe'",
    ")",
    "foreach ($key in $keys) { try { $item = Get-Item -LiteralPath $key; if ($item) { $v=$item.GetValue(''); if ($v) { $paths.Add([string]$v) } } } catch {} }",
    "$paths | Select-Object -Unique | ConvertTo-Json -Compress"
  ].join("\n");
  try {
    const { stdout } = await execFileAsync("powershell.exe", [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script
    ], { timeout: 7000, windowsHide: true, maxBuffer: 32768 });
    if (!stdout.trim()) return [];
    const parsed = JSON.parse(stdout.trim()) as string | string[];
    const paths = Array.isArray(parsed) ? parsed : [parsed];
    const valid: Array<Record<string, string>> = [];
    for (const path of paths.slice(0, 15)) {
      if (typeof path !== "string" || !/[\\/]CLIPStudioPaint\.exe$/i.test(path)) continue;
      if ((await stat(path).catch(() => null))?.isFile()) {
        valid.push({ executablePath: path });
      }
    }
    return valid;
  } catch {
    return [];
  }
}

export class ProviderConnectionController {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly base: GatewayConfig,
    private readonly manager: ProviderManager,
    readonly registry: MachineProviderRegistry
  ) {}

  async list() {
    return {
      catalog: providerSettingCatalog,
      saved: await this.registry.list(),
      live: this.manager.snapshot()
    };
  }

  async discover(provider: string): Promise<ProviderDiscoveryResult> {
    if (!Object.prototype.hasOwnProperty.call(providerSettingCatalog, provider) || !this.base.providers[provider]) {
      throw new Error("Unknown or unsupported configured provider: " + provider);
    }
    const template = providerSettingCatalog[provider as keyof typeof providerSettingCatalog];
    const candidates = provider === "clipstudio" ? await findInstalledClipStudio() : [];
    const saved = await this.registry.list();
    return {
      provider,
      description: template.description,
      fields: template.fields,
      discovery: template.discovery,
      candidates,
      configured: saved[provider as keyof typeof saved]?.enabled ?? false
    };
  }

  private serialized<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.queue.then(operation);
    this.queue = task.then(() => undefined, () => undefined);
    return task;
  }

  async configure(provider: string, values: Record<string, unknown>, autoDetect = false) {
    return this.serialized(async () => {
      if (!this.base.providers[provider]) throw new Error("Provider is not declared in the local VGate configuration.");
      let input = values;
      if (autoDetect) {
        if (provider !== "clipstudio" || Object.keys(values).length > 0) {
          throw new Error("Auto-detect currently supports CLIP STUDIO PAINT with no manual fields.");
        }
        const discovery = await this.discover(provider);
        if (discovery.candidates.length === 0) throw new Error("No running or registered CLIP STUDIO PAINT executable was detected.");
        input = discovery.candidates[0];
      }
      const record = await this.registry.save(provider, input);
      await this.manager.reloadConfig(mergeManagedProviderConfig(this.base, await this.registry.list()));
      return { provider, saved: record, live: this.manager.snapshot().providers[provider] };
    });
  }

  async reload() {
    return this.serialized(async () => {
      await this.manager.reloadConfig(mergeManagedProviderConfig(this.base, await this.registry.list()));
      return this.manager.snapshot();
    });
  }

  async forget(provider: string) {
    return this.serialized(async () => {
      if (!this.base.providers[provider]) throw new Error("Provider is not declared in the local VGate configuration.");
      const record = await this.registry.forget(provider);
      await this.manager.reloadConfig(mergeManagedProviderConfig(this.base, await this.registry.list()));
      return { provider, saved: record, live: this.manager.snapshot().providers[provider] };
    });
  }
}