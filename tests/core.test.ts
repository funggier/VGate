import { describe, expect, test } from "vitest";
import { parseGatewayConfig, selectProviders, resolveEnvRefs } from "../src/config.js";
import { makeUpstreamName } from "../src/namespace.js";
import { toolAllowed } from "../src/policy.js";

describe("gateway config", () => {
  test("parses stdio and http providers and selects the active profile", () => {
    const config = parseGatewayConfig({
      version: 1,
      activeProfile: "game",
      profiles: { game: { providers: ["local", "roblox"] } },
      providers: {
        local: { transport: "stdio", command: "node", args: ["server.js"] },
        roblox: { transport: "http", url: "http://127.0.0.1:3000/mcp" },
        hidden: { transport: "stdio", command: "node", args: ["hidden.js"] }
      }
    });
    expect(selectProviders(config).map(([id]) => id)).toEqual(["local", "roblox"]);
  });

  test("rejects invalid provider ids", () => {
    expect(() => parseGatewayConfig({
      version: 1,
      providers: { "Bad Provider": { transport: "stdio", command: "node" } }
    })).toThrow(/provider/i);
  });

  test("resolves env references without exposing a fallback secret", () => {
    const tokenRef = "$" + "{env:TOKEN}";
    const missingRef = "$" + "{env:MISSING}";
    expect(resolveEnvRefs("Bearer " + tokenRef, { TOKEN: "abc" })).toBe("Bearer abc");
    expect(() => resolveEnvRefs(missingRef, {})).toThrow(/MISSING/);
  });
});

describe("namespaces", () => {
  test("normalizes provider and downstream tool names deterministically", () => {
    expect(makeUpstreamName("blender", "object.create/mesh")).toBe("blender__object_create_mesh");
    expect(makeUpstreamName("roblox-dev", "Run Luau")).toBe("roblox-dev__Run_Luau");
  });

  test("rejects capability names that use the reserved VGate prefix", () => {
    expect(() => makeUpstreamName("vgate", "status")).toThrow(/reserved/i);
    expect(() => makeUpstreamName("blender", "vgate_refresh")).toThrow(/reserved/i);
  });
});

describe("tool policy", () => {
  test("deny wins and allow list is authoritative when present", () => {
    const p = { default: "allow" as const, allow: ["scene.*", "render"], deny: ["scene.delete*"] };
    expect(toolAllowed("scene.inspect", p)).toBe(true);
    expect(toolAllowed("scene.delete_all", p)).toBe(false);
    expect(toolAllowed("filesystem.read", p)).toBe(false);
  });

  test("default deny without allow blocks everything", () => {
    expect(toolAllowed("anything", { default: "deny" })).toBe(false);
  });
});
