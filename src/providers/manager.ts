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

export interface DiscoveredPrompt {
  providerId: string;
  downstreamName: string;
  upstreamName: string;
  title?: string;
  description?: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
}

export interface DiscoveredResource {
  providerId: string;
  downstreamUri: string;
  upstreamUri: string;
  upstreamName: string;
  title?: string;
  description?: string;
  mimeType?: string;
  size?: number;
  annotations?: Record<string, unknown>;
}

interface ProviderRuntime {
  id: string;
  config: ProviderConfig;
  state: ProviderStateName;
  client?: Client;
  transport?: { close(): Promise<void> };
  tools: DiscoveredTool[];
  prompts: DiscoveredPrompt[];
  resources: DiscoveredResource[];
  resourceTemplateCount: number;
  lastError?: string;
}

function inheritedEnvironment(extra: Record<string, string>): Record<string, string> {
  const base = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  return { ...base, ...extra };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function upstreamResourceUri(providerId: string, downstreamUri: string): string {
  return "vgate://" + providerId + "/" + encodeURIComponent(downstreamUri);
}

export class ProviderManager {
  private readonly runtimes = new Map<string, ProviderRuntime>();
  private readonly routes = new Map<string, DiscoveredTool>();
  private readonly promptRoutes = new Map<string, DiscoveredPrompt>();
  private readonly resourceRoutes = new Map<string, DiscoveredResource>();

  constructor(private config: GatewayConfig) {
    this.initializeRuntimes();
  }

  private readonly unconfigured = new Set<string>();

  private initializeRuntimes(): void {
    const active = this.config.activeProfile
      ? new Set(this.config.profiles[this.config.activeProfile]?.providers ?? [])
      : null;
    for (const [id, provider] of Object.entries(this.config.providers)) {
      if (active && !active.has(id)) continue;
      let resolved = provider;
      let configured = provider.enabled;
      let lastError: string | undefined;
      if (configured) {
        try {
          const selected = selectProviders({
            ...this.config, activeProfile: undefined, profiles: {}, providers: { [id]: provider }
          });
          resolved = selected[0]?.[1] ?? provider;
        } catch (error) {
          configured = false;
          lastError = "Missing provider configuration: " + errorMessage(error);
        }
      }
      this.runtimes.set(id, {
        id, config: resolved, state: "disabled", tools: [], prompts: [],
        resources: [], resourceTemplateCount: 0,
        lastError: configured ? undefined : lastError ?? "Provider disabled in local settings."
      });
      if (!configured) this.unconfigured.add(id);
    }
  }

  async connectAll(): Promise<void> {
    for (const runtime of this.runtimes.values()) {
      if (this.unconfigured.has(runtime.id)) continue;
      await this.connectOne(runtime);
    }
  }

  async reloadConfig(next: GatewayConfig): Promise<void> {
    await this.close();
    this.runtimes.clear();
    this.unconfigured.clear();
    this.config = next;
    this.initializeRuntimes();
    await this.connectAll();
  }

  private async connectOne(runtime: ProviderRuntime): Promise<void> {
    runtime.state = "connecting";
    runtime.lastError = undefined;
    let client: Client | undefined;
    let transport: StdioClientTransport | StreamableHTTPClientTransport | undefined;
    try {
      client = new Client(
        { name: "vgate-" + runtime.id, version: "0.1.5" },
        { versionNegotiation: { mode: "auto", probe: { timeoutMs: Math.min(runtime.config.timeoutMs, 5000) } } }
      );

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

      await client.connect(transport, { timeout: runtime.config.timeoutMs, maxTotalTimeout: runtime.config.timeoutMs });
      const capabilities = client.getServerCapabilities();

      const listed = await client.listTools(undefined, {
        timeout: runtime.config.timeoutMs,
        maxTotalTimeout: runtime.config.timeoutMs,
        cacheMode: "refresh"
      });
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

      const prompts: DiscoveredPrompt[] = [];
      if (capabilities?.prompts) {
        const listedPrompts = await client.listPrompts(undefined, {
          timeout: runtime.config.timeoutMs,
          maxTotalTimeout: runtime.config.timeoutMs,
          cacheMode: "refresh"
        });
        for (const prompt of listedPrompts.prompts) {
          const upstreamName = makeUpstreamName(runtime.id, prompt.name);
          if (this.promptRoutes.has(upstreamName)) {
            runtime.state = "degraded";
            runtime.lastError = "Prompt collision for " + upstreamName;
            continue;
          }
          const discovered: DiscoveredPrompt = {
            providerId: runtime.id,
            downstreamName: prompt.name,
            upstreamName,
            title: prompt.title,
            description: prompt.description,
            arguments: prompt.arguments?.map((arg) => ({
              name: arg.name,
              description: arg.description,
              required: arg.required
            }))
          };
          prompts.push(discovered);
          this.promptRoutes.set(upstreamName, discovered);
        }
      }

      const resources: DiscoveredResource[] = [];
      let resourceTemplateCount = 0;
      if (capabilities?.resources) {
        const listedResources = await client.listResources(undefined, {
          timeout: runtime.config.timeoutMs,
          maxTotalTimeout: runtime.config.timeoutMs,
          cacheMode: "refresh"
        });
        for (const resource of listedResources.resources) {
          const upstreamName = makeUpstreamName(runtime.id, resource.name);
          const upstreamUri = upstreamResourceUri(runtime.id, resource.uri);
          if (this.resourceRoutes.has(upstreamUri)) {
            runtime.state = "degraded";
            runtime.lastError = "Resource collision for " + upstreamUri;
            continue;
          }
          const discovered: DiscoveredResource = {
            providerId: runtime.id,
            downstreamUri: resource.uri,
            upstreamUri,
            upstreamName,
            title: resource.title,
            description: resource.description,
            mimeType: resource.mimeType,
            size: resource.size,
            annotations: resource.annotations as Record<string, unknown> | undefined
          };
          resources.push(discovered);
          this.resourceRoutes.set(upstreamUri, discovered);
        }
        try {
          const templates = await client.listResourceTemplates(undefined, {
            timeout: runtime.config.timeoutMs,
            maxTotalTimeout: runtime.config.timeoutMs,
            cacheMode: "refresh"
          });
          resourceTemplateCount = templates.resourceTemplates.length;
        } catch {
          resourceTemplateCount = 0;
        }
      }

      runtime.client = client;
      runtime.transport = transport;
      runtime.tools = tools;
      runtime.prompts = prompts;
      runtime.resources = resources;
      runtime.resourceTemplateCount = resourceTemplateCount;
      if (runtime.state !== "degraded") runtime.state = "ready";
    } catch (error) {
      for (const [name, route] of this.routes) {
        if (route.providerId === runtime.id) this.routes.delete(name);
      }
      for (const [name, route] of this.promptRoutes) {
        if (route.providerId === runtime.id) this.promptRoutes.delete(name);
      }
      for (const [uri, route] of this.resourceRoutes) {
        if (route.providerId === runtime.id) this.resourceRoutes.delete(uri);
      }
      runtime.state = "error";
      runtime.lastError = errorMessage(error);
      runtime.tools = [];
      runtime.prompts = [];
      runtime.resources = [];
      runtime.resourceTemplateCount = 0;
      try { await client?.close(); } catch {}
      if (!client) {
        try { await transport?.close(); } catch {}
      }
      runtime.client = undefined;
      runtime.transport = undefined;
    }
  }

  listTools(): DiscoveredTool[] {
    return [...this.routes.values()].sort((a, b) => a.upstreamName.localeCompare(b.upstreamName));
  }

  listPrompts(): DiscoveredPrompt[] {
    return [...this.promptRoutes.values()].sort((a, b) => a.upstreamName.localeCompare(b.upstreamName));
  }

  listResources(): DiscoveredResource[] {
    return [...this.resourceRoutes.values()].sort((a, b) => a.upstreamName.localeCompare(b.upstreamName));
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
    return runtime.client.callTool(
      { name: route.downstreamName, arguments: args },
      { timeout: runtime.config.timeoutMs, maxTotalTimeout: runtime.config.timeoutMs }
    );
  }

  async getPrompt(upstreamName: string, args: Record<string, string>): Promise<any> {
    const route = this.promptRoutes.get(upstreamName);
    if (!route) throw new Error("Unknown or stale VGate prompt route: " + upstreamName);
    const runtime = this.runtimes.get(route.providerId);
    if (!runtime?.client) throw new Error("Provider is not ready for prompt: " + upstreamName);
    return runtime.client.getPrompt(
      { name: route.downstreamName, arguments: args },
      { timeout: runtime.config.timeoutMs, maxTotalTimeout: runtime.config.timeoutMs }
    );
  }

  async readResource(upstreamUri: string): Promise<any> {
    const route = this.resourceRoutes.get(upstreamUri);
    if (!route) throw new Error("Unknown or stale VGate resource route: " + upstreamUri);
    const runtime = this.runtimes.get(route.providerId);
    if (!runtime?.client) throw new Error("Provider is not ready for resource: " + upstreamUri);
    const result = await runtime.client.readResource(
      { uri: route.downstreamUri },
      { timeout: runtime.config.timeoutMs, maxTotalTimeout: runtime.config.timeoutMs, cacheMode: "refresh" }
    );
    return {
      ...result,
      contents: result.contents.map((content) => ({ ...content, uri: upstreamUri }))
    };
  }

  snapshot(): {
    activeProfile?: string;
    providers: Record<string, {
      state: ProviderStateName;
      transport: "stdio" | "http";
      toolCount: number;
      promptCount: number;
      resourceCount: number;
      resourceTemplateCount: number;
      lastError?: string;
    }>;
  } {
    return {
      activeProfile: this.config.activeProfile,
      providers: Object.fromEntries([...this.runtimes.entries()].map(([id, runtime]) => [id, {
        state: runtime.state,
        transport: runtime.config.transport,
        toolCount: runtime.tools.length,
        promptCount: runtime.prompts.length,
        resourceCount: runtime.resources.length,
        resourceTemplateCount: runtime.resourceTemplateCount,
        lastError: runtime.lastError
      }]))
    };
  }

  async close(): Promise<void> {
    this.routes.clear();
    this.promptRoutes.clear();
    this.resourceRoutes.clear();
    for (const runtime of this.runtimes.values()) {
      try { await runtime.client?.close(); } catch {}
      runtime.client = undefined;
      runtime.transport = undefined;
      runtime.tools = [];
      runtime.prompts = [];
      runtime.resources = [];
      runtime.resourceTemplateCount = 0;
      runtime.state = "disabled";
    }
  }

  async refresh(): Promise<void> {
    await this.close();
    await this.connectAll();
  }
}