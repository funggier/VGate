import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createGatewayServer } from "./gateway.js";
import { ProviderManager } from "./providers/manager.js";
import { loadRuntimeConfig, logDiagnostic, resolveConfigPath } from "./runtime.js";
import { MachineProviderRegistry, mergeManagedProviderConfig } from "./provider-settings.js";
import { ProviderConnectionController } from "./provider-connections.js";
import { resolve } from "node:path";

const base = await loadRuntimeConfig();
const registry = new MachineProviderRegistry(resolve(process.env.VGATE_PROVIDER_SETTINGS ?? "local-secrets/provider-connections.json"));
const config = mergeManagedProviderConfig(base, await registry.list());
const manager = new ProviderManager(config);
const connections = new ProviderConnectionController(base, manager, registry);
await manager.connectAll();

const path = await resolveConfigPath();
logDiagnostic("starting stdio gateway", {
  config: path ?? "<empty>",
  providers: manager.snapshot().providers
});

const shutdown = async () => {
  await manager.close().catch(() => {});
};
process.once("SIGINT", () => { void shutdown().finally(() => process.exit(0)); });
process.once("SIGTERM", () => { void shutdown().finally(() => process.exit(0)); });
process.once("beforeExit", () => { void shutdown(); });

await serveStdio(() => createGatewayServer(manager, connections).server);