import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createGatewayServer } from "./gateway.js";
import { ProviderManager } from "./providers/manager.js";
import { loadRuntimeConfig, logDiagnostic, resolveConfigPath } from "./runtime.js";

const config = await loadRuntimeConfig();
const manager = new ProviderManager(config);
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

await serveStdio(() => createGatewayServer(manager).server);
