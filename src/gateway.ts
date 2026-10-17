import {
  McpServer,
  fromJsonSchema,
  type RegisteredPrompt,
  type RegisteredResource,
  type RegisteredTool
} from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { createConditionalReadCache } from "./conditional-read-cache.js";
import type { DiscoveredPrompt, DiscoveredResource, ProviderManager } from "./providers/manager.js";

export interface GatewayServerBundle {
  server: McpServer;
  reconcileCapabilities(): void;
}

function statusResult(payload: unknown) {
  const text = JSON.stringify(payload, null, 2);
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: payload as Record<string, unknown>
  };
}

const conditionalReadSchema = z.object({
  known_digest: z.string().regex(/^[0-9a-f]{64}$/i).optional(),
  cache_max_age_ms: z.number().int().min(0).max(300000).optional()
});

type ConditionalReadArgs = z.infer<typeof conditionalReadSchema>;

async function conditionalStatusResult(
  cache: ReturnType<typeof createConditionalReadCache>,
  cacheKey: string,
  args: ConditionalReadArgs,
  payloadFactory: () => Record<string, unknown>
) {
  let payload: Record<string, unknown> | undefined;
  const result = await cache.run({
    cacheKey,
    knownDigest: args.known_digest,
    cacheMaxAgeMs: args.cache_max_age_ms ?? 0,
    execute: () => {
      payload = payloadFactory();
      return JSON.stringify(payload, null, 2);
    }
  });

  const metadata = {
    result_digest_sha256: result.resultDigestSha256,
    result_bytes: result.resultBytes,
    result_chars: result.resultChars,
    returned_chars: result.returnedChars,
    not_modified: result.notModified,
    result_suppressed: result.resultSuppressed,
    cache_hit: result.cacheHit,
    execution_skipped: result.executionSkipped,
    cache_age_ms: result.cacheAgeMs,
    content_retained: result.contentRetained
  };

  if (result.notModified) return statusResult(metadata);
  return statusResult({ ...(payload ?? {}), ...metadata });
}

function promptSchema(prompt: DiscoveredPrompt): z.ZodObject<any> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const arg of prompt.arguments ?? []) {
    const schema = arg.description ? z.string().describe(arg.description) : z.string();
    shape[arg.name] = arg.required ? schema : schema.optional();
  }
  return z.object(shape);
}

function resourceMetadata(resource: DiscoveredResource): Record<string, unknown> {
  return {
    title: resource.title,
    description: resource.description,
    mimeType: resource.mimeType,
    size: resource.size,
    annotations: resource.annotations
  };
}

export function createGatewayServer(manager: ProviderManager): GatewayServerBundle {
  const server = new McpServer({ name: "VGate", version: "0.1.4" });
  const proxiedTools = new Map<string, RegisteredTool>();
  const proxiedPrompts = new Map<string, RegisteredPrompt>();
  const proxiedResources = new Map<string, RegisteredResource>();
  const controlReadCache = createConditionalReadCache({ maxEntries: 16, maxCacheAgeMs: 300000 });

  const registerProxyTool = (tool: ReturnType<ProviderManager["listTools"]>[number]) => {
    const inputSchema = fromJsonSchema(tool.inputSchema as any);
    const outputSchema = tool.outputSchema ? fromJsonSchema(tool.outputSchema as any) : undefined;
    const config: any = {
      description: tool.description ?? ("Proxied from " + tool.providerId + ":" + tool.downstreamName),
      inputSchema,
      annotations: tool.annotations
    };
    if (outputSchema) config.outputSchema = outputSchema;
    const handle = server.registerTool(tool.upstreamName, config, async (args: unknown) => {
      const normalized = args && typeof args === "object" && !Array.isArray(args)
        ? args as Record<string, unknown>
        : {};
      return await manager.callTool(tool.upstreamName, normalized) as any;
    });
    proxiedTools.set(tool.upstreamName, handle);
  };

  const registerProxyPrompt = (prompt: DiscoveredPrompt) => {
    const handle = server.registerPrompt(prompt.upstreamName, {
      description: prompt.description,
      argsSchema: promptSchema(prompt)
    }, async (args: Record<string, unknown>) => {
      const normalized = Object.fromEntries(
        Object.entries(args ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === "string")
      );
      return await manager.getPrompt(prompt.upstreamName, normalized) as any;
    });
    proxiedPrompts.set(prompt.upstreamName, handle);
  };

  const registerProxyResource = (resource: DiscoveredResource) => {
    const handle = server.registerResource(
      resource.upstreamName,
      resource.upstreamUri,
      resourceMetadata(resource) as any,
      async (uri) => await manager.readResource(uri.href) as any
    );
    proxiedResources.set(resource.upstreamUri, handle);
  };

  const reconcileCapabilities = () => {
    const tools = new Map(manager.listTools().map((tool) => [tool.upstreamName, tool]));
    for (const [name, handle] of proxiedTools) {
      if (!tools.has(name)) {
        handle.remove();
        proxiedTools.delete(name);
      }
    }
    for (const [name, tool] of tools) {
      const old = proxiedTools.get(name);
      if (!old) {
        registerProxyTool(tool);
        continue;
      }
      const inputSchema = fromJsonSchema(tool.inputSchema as any);
      const outputSchema = tool.outputSchema ? fromJsonSchema(tool.outputSchema as any) : undefined;
      old.update({
        description: tool.description ?? ("Proxied from " + tool.providerId + ":" + tool.downstreamName),
        paramsSchema: inputSchema,
        outputSchema: outputSchema as any,
        annotations: tool.annotations as any,
        callback: async (args: unknown) => {
          const normalized = args && typeof args === "object" && !Array.isArray(args)
            ? args as Record<string, unknown>
            : {};
          return await manager.callTool(name, normalized) as any;
        }
      });
    }

    const prompts = new Map(manager.listPrompts().map((prompt) => [prompt.upstreamName, prompt]));
    for (const [name, handle] of proxiedPrompts) {
      if (!prompts.has(name)) {
        handle.remove();
        proxiedPrompts.delete(name);
      }
    }
    for (const [name, prompt] of prompts) {
      const old = proxiedPrompts.get(name);
      if (old) old.remove();
      proxiedPrompts.delete(name);
      registerProxyPrompt(prompt);
    }

    const resources = new Map(manager.listResources().map((resource) => [resource.upstreamUri, resource]));
    for (const [uri, handle] of proxiedResources) {
      if (!resources.has(uri)) {
        handle.remove();
        proxiedResources.delete(uri);
      }
    }
    for (const [uri, resource] of resources) {
      const old = proxiedResources.get(uri);
      if (old) old.remove();
      proxiedResources.delete(uri);
      registerProxyResource(resource);
    }
  };

  server.registerTool("vgate_status", {
    description: "Return VGate gateway and downstream provider health. Supports SHA-256 conditional reads and a bounded digest-only metadata cache.",
    inputSchema: conditionalReadSchema
  }, async (args: ConditionalReadArgs) => conditionalStatusResult(
    controlReadCache,
    "vgate_status:v1",
    args,
    () => ({
      gateway: { name: "VGate", version: "0.1.4" },
      ...manager.snapshot()
    })
  ));

  server.registerTool("vgate_list_providers", {
    description: "List configured downstream MCP providers and discovered capability counts. Supports SHA-256 conditional reads and a bounded digest-only metadata cache.",
    inputSchema: conditionalReadSchema
  }, async (args: ConditionalReadArgs) => conditionalStatusResult(
    controlReadCache,
    "vgate_list_providers:v1",
    args,
    () => manager.snapshot() as Record<string, unknown>
  ));

  server.registerTool("vgate_refresh", {
    description: "Reconnect downstream MCP providers, re-discover capabilities, and reconcile the upstream surface.",
    inputSchema: z.object({})
  }, async () => {
    await manager.refresh();
    reconcileCapabilities();
    controlReadCache.clear();
    return statusResult({ refreshed: true, ...manager.snapshot() });
  });

  reconcileCapabilities();
  return { server, reconcileCapabilities };
}