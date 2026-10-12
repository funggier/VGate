import { ProviderManager } from "../src/providers/manager.js";
import { loadRuntimeConfig } from "../src/runtime.js";

const config = await loadRuntimeConfig();
const manager = new ProviderManager(config);
try {
  await manager.connectAll();
  const snapshot = manager.snapshot();
  const tools = manager.listTools();
  process.stdout.write(JSON.stringify({
    snapshot,
    totalTools: tools.length,
    toolsByProvider: Object.fromEntries(
      Object.keys(snapshot.providers).map((providerId) => [
        providerId,
        tools.filter((tool) => tool.providerId === providerId).map((tool) => tool.downstreamName)
      ])
    )
  }, null, 2) + "\n");
} finally {
  await manager.close();
}
