import { readFile } from "node:fs/promises";
import * as z from "zod/v4";

const providerIdPattern = /^[a-z][a-z0-9_-]*$/;

const toolPolicySchema = z.object({
  default: z.enum(["allow", "deny"]).default("allow"),
  allow: z.array(z.string()).optional(),
  deny: z.array(z.string()).optional()
}).default({ default: "allow" });

const providerBase = {
  enabled: z.boolean().default(true),
  timeoutMs: z.number().int().positive().max(300000).default(30000),
  toolPolicy: toolPolicySchema
};

const stdioProviderSchema = z.object({
  ...providerBase,
  transport: z.literal("stdio"),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  cwd: z.string().min(1).optional(),
  env: z.record(z.string(), z.string()).default({})
});

const httpProviderSchema = z.object({
  ...providerBase,
  transport: z.literal("http"),
  url: z.url(),
  headers: z.record(z.string(), z.string()).default({})
});

export const providerSchema = z.discriminatedUnion("transport", [
  stdioProviderSchema,
  httpProviderSchema
]);

const configSchema = z.object({
  version: z.literal(1),
  activeProfile: z.string().min(1).optional(),
  profiles: z.record(z.string(), z.object({
    providers: z.array(z.string())
  })).default({}),
  providers: z.record(z.string(), providerSchema).default({}),
  upstream: z.object({
    http: z.object({
      enabled: z.boolean().default(false),
      host: z.string().default("127.0.0.1"),
      port: z.number().int().min(1).max(65535).default(8765),
      path: z.string().startsWith("/").default("/mcp")
    }).default({ enabled: false, host: "127.0.0.1", port: 8765, path: "/mcp" })
  }).default({ http: { enabled: false, host: "127.0.0.1", port: 8765, path: "/mcp" } })
});

export type ToolPolicy = z.infer<typeof toolPolicySchema>;
export type ProviderConfig = z.infer<typeof providerSchema>;
export type GatewayConfig = z.infer<typeof configSchema>;

export function parseGatewayConfig(input: unknown): GatewayConfig {
  const parsed = configSchema.parse(input);
  for (const [id] of Object.entries(parsed.providers)) {
    if (!providerIdPattern.test(id)) {
      throw new Error('Invalid provider id "' + id + '". Provider ids must match lowercase letters, digits, underscores, or hyphens.');
    }
  }
  if (parsed.activeProfile && !parsed.profiles[parsed.activeProfile]) {
    throw new Error('Active profile "' + parsed.activeProfile + '" does not exist.');
  }
  for (const [name, profile] of Object.entries(parsed.profiles)) {
    for (const id of profile.providers) {
      if (!parsed.providers[id]) throw new Error('Profile "' + name + '" references unknown provider "' + id + '".');
    }
  }
  return parsed;
}

export function resolveEnvRefs(value: string, env: NodeJS.ProcessEnv = process.env): string {
  return value.replace(/\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, (_all, name: string) => {
    const resolved = env[name];
    if (resolved === undefined) throw new Error("Required environment variable " + name + " is not set.");
    return resolved;
  });
}

function resolveProvider(provider: ProviderConfig, env: NodeJS.ProcessEnv): ProviderConfig {
  if (provider.transport === "stdio") {
    return {
      ...provider,
      command: resolveEnvRefs(provider.command, env),
      args: provider.args.map((v) => resolveEnvRefs(v, env)),
      cwd: provider.cwd ? resolveEnvRefs(provider.cwd, env) : undefined,
      env: Object.fromEntries(Object.entries(provider.env).map(([k, v]) => [k, resolveEnvRefs(v, env)]))
    };
  }
  return {
    ...provider,
    url: resolveEnvRefs(provider.url, env),
    headers: Object.fromEntries(Object.entries(provider.headers).map(([k, v]) => [k, resolveEnvRefs(v, env)]))
  };
}

export function selectProviders(config: GatewayConfig, env: NodeJS.ProcessEnv = process.env): Array<[string, ProviderConfig]> {
  const selected = config.activeProfile
    ? new Set(config.profiles[config.activeProfile]!.providers)
    : null;
  return Object.entries(config.providers)
    .filter(([id, provider]) => provider.enabled && (!selected || selected.has(id)))
    .map(([id, provider]) => [id, resolveProvider(provider, env)]);
}

export async function loadGatewayConfig(path: string, env: NodeJS.ProcessEnv = process.env): Promise<GatewayConfig> {
  const raw = await readFile(path, "utf8");
  const parsed = parseGatewayConfig(JSON.parse(raw.replace(/^\uFEFF/, "")));
  for (const [, provider] of selectProviders(parsed, env)) void provider;
  return parsed;
}
