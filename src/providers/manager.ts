import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import type { GatewayConfig, ProviderConfig } from "../config.js";
import { selectProviders } from "../config.js";
import { makeUpstreamName } from "../namespace.js";
import { toolAllowed } from "../policy.js";

type ProviderStateName = "disabled" | "connecting" | "ready" | "degraded" | "error";

export interface DiscoveredTool {
  providerId: string;
  downstreamName: string;
  upstreamName: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

interface ProviderRuntime {
  id: string;
  config: ProviderConfig;
  state: ProviderStateName;
  client?: Client;
  transport?: { close(): Promise<void> };
  tools: DiscoveredTool[];
  lastError?: string;
}

function inheritedEnvironment(extra: Record<string, string>): Record<string, string> {
  const base = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  return { ...base, ...extra };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class ProviderManager {
  private readonly runtimes = new Map<string, ProviderRuntime>();
  private readonly routes = new Map<string, DiscoveredTool>();

  constructor(private readonly config: GatewayConfig) {
    for (const [id, provider] of selectProviders(config)) {
      this.runtimes.set(id, { id, config: provider, state: "disabled", tools: [] });
    }
  }

  async connectAll(): Promise<void> {
    for (const runtime of this.runtimes.values()) {
      await this.connectOne(runtime);
    }
  }

  private async connectOne(runtime: ProviderRuntime): Promise<void> {
    runtime.state = "connecting";
    runtime.lastError = undefined;
    try {
      const client = new Client({ name: "vgate-" + runtime.id, version: "0.1.0" });
      let transport: StdioClientTransport | StreamableHTTPClientTransport;
      if (runtime.config.transport === "stdio") {
        transport = new StdioClientTransport({
          command: runtime.config.command,
          args: runtime.config.args,
          cwd: runtime.config.cwd,
          env: inheritedEnvironment(runtime.config.env)
        });
      } else {
        transport = new StreamableHTTPClientTransport(new URL(runtime.config.url), {
          requestInit: { headers: runtime.config.headers }
        });
      }

      await client.connect(transport);
      const listed = await client.listTools();
      const tools: DiscoveredTool[] = [];
      const localNames = new Set<string>();

      for (const tool of listed.tools) {
        if (!toolAllowed(tool.name, runtime.config.toolPolicy)) continue;
        const upstreamName = makeUpstreamName(runtime.id, tool.name);
        if (localNames.has(upstreamName) || this.routes.has(upstreamName)) {
          runtime.state = "degraded";
          runtime.lastError = "Capability collision for " + upstreamName;
          continue;
        }
        localNames.add(upstreamName);
        const discovered: DiscoveredTool = {
          providerId: runtime.id,
          downstreamName: tool.name,
          upstreamName,
          description: tool.description,
          inputSchema: (tool.inputSchema ?? { type: "object" }) as Record<string, unknown>,
          outputSchema: tool.outputSchema as Record<string, unknown> | undefined,
          annotations: tool.annotations as Record<string, unknown> | undefined
        };
        tools.push(discovered);
        this.routes.set(upstreamName, discovered);
      }

      runtime.client = client;
      runtime.transport = transport;
      runtime.tools = tools;
      if (runtime.state !== "degraded") runtime.state = "ready";
    } catch (error) {
      runtime.state = "error";
      runtime.lastError = errorMessage(error);
      runtime.tools = [];
      if (runtime.client) {
        try { await runtime.client.close(); } catch {}
      }
      runtime.client = undefined;
      runtime.transport = undefined;
    }
  }

  listTools(): DiscoveredTool[] {
    return [...this.routes.values()].sort((a, b) => a.upstreamName.localeCompare(b.upstreamName));
  }

  async callTool(upstreamName: string, args: Record<string, unknown>): Promise<any> {
    const route = this.routes.get(upstreamName);
    if (!route) throw new Error("Unknown or stale VGate route: " + upstreamName);
    const runtime = this.runtimes.get(route.providerId);
    if (!runtime?.client || (runtime.state !== "ready" && runtime.state !== "degraded")) {
      throw new Error("Provider is not ready for route: " + upstreamName);
    }
    if (!toolAllowed(route.downstreamName, runtime.config.toolPolicy)) {
      throw new Error("Route blocked by current provider policy: " + upstreamName);
    }
    return runtime.client.callTool({ name: route.downstreamName, arguments: args });
  }

  snapshot(): {
    activeProfile?: string;
    providers: Record<string, {
      state: ProviderStateName;
      transport: "stdio" | "http";
      toolCount: number;
      lastError?: string;
    }>;
  } {
    return {
      activeProfile: this.config.activeProfile,
      providers: Object.fromEntries([...this.runtimes.entries()].map(([id, runtime]) => [id, {
        state: runtime.state,
        transport: runtime.config.transport,
        toolCount: runtime.tools.length,
        lastError: runtime.lastError
      }]))
    };
  }

  async close(): Promise<void> {
    this.routes.clear();
    for (const runtime of this.runtimes.values()) {
      try { await runtime.client?.close(); } catch {}
      runtime.client = undefined;
      runtime.transport = undefined;
      runtime.tools = [];
      runtime.state = "disabled";
    }
  }

  async refresh(): Promise<void> {
    await this.close();
    await this.connectAll();
  }
}
