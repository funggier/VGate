import { pathToFileURL } from "node:url";
import { ProviderManager } from "./providers/manager.js";
import { startGatewayHttp } from "./http.js";
import { loadRuntimeConfig, logDiagnostic, resolveConfigPath } from "./runtime.js";
import { MachineProviderRegistry, mergeManagedProviderConfig } from "./provider-settings.js";
import { ProviderConnectionController } from "./provider-connections.js";
import { resolve } from "node:path";

export { startGatewayHttp } from "./http.js";

export async function main(): Promise<void> {
  const base = await loadRuntimeConfig();
  const registry = new MachineProviderRegistry(resolve(process.env.VGATE_PROVIDER_SETTINGS ?? "local-secrets/provider-connections.json"));
  const config = mergeManagedProviderConfig(base, await registry.list());
  if (!config.upstream.http.enabled) {
    throw new Error("VGate HTTP upstream is disabled in configuration.");
  }

  const manager = new ProviderManager(config);
  const connections = new ProviderConnectionController(base, manager, registry);
  await manager.connectAll();

  const options = config.upstream.http;
  const http = await startGatewayHttp(manager, options, connections);
  const path = await resolveConfigPath();
  logDiagnostic("HTTP gateway listening", {
    config: path ?? "<empty>",
    url: http.url,
    providers: manager.snapshot().providers
  });

  const shutdown = async () => {
    await http.close().catch(() => {});
    await manager.close().catch(() => {});
  };
  process.once("SIGINT", () => { void shutdown().finally(() => process.exit(0)); });
  process.once("SIGTERM", () => { void shutdown().finally(() => process.exit(0)); });
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (entry === import.meta.url) {
  await main();
}