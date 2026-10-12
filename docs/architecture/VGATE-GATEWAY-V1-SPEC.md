# VGate Gateway v1 — Architecture Specification

## Goal
Turn VGate into a clean, deterministic MCP gateway that exposes one upstream MCP endpoint while federating multiple downstream MCP servers.

## Binding constraints
- Project: `funggier/VGate`.
- Local runtime root: `T:\Sanbox\openclawspace\VGate-mcp`.
- Preserve only the existing ChatGPT tunnel connection assets/configuration needed to keep the current VGate plugin identity reachable.
- Do not reuse LConnect application code as VGate core.
- Node.js >= 20, TypeScript, MCP TypeScript SDK v2.
- Upstream transports: stdio (required for the current tunnel) and Streamable HTTP.
- Downstream transports: stdio and Streamable HTTP.
- No embedded LLM. VGate is deterministic infrastructure.
- Dynamic discovery: downstream tool schemas are discovered at runtime; no provider-specific hard coding.
- Namespaces prevent collisions: `<provider>__<capability>`.
- Failure isolation: one bad provider must not prevent healthy providers or VGate control tools from working.
- Runtime refresh must add/remove/update proxied capabilities without restarting the upstream process when the SDK permits it.
- Config supports provider enablement, profiles, tool allow/deny policy, timeout, and environment references without committing secrets.
- Logs go to stderr or files; stdout remains MCP protocol only.
- Current tunnel credentials/profile remain local and ignored by Git.

## Architecture

```text
ChatGPT / MCP Host
        |
        | MCP (stdio through existing tunnel, or Streamable HTTP)
        v
+---------------------------+
|           VGate           |
| config / registry         |
| discovery / namespaces    |
| routing / policy          |
| sessions / refresh        |
| health / audit            |
+-------------+-------------+
              |
      +-------+-------+----------------+
      |               |                |
      v               v                v
 LConnect MCP     Roblox MCP       Blender MCP ...
 stdio/http       stdio/http       stdio/http
```

## Capability model
VGate proxies downstream tools natively. Static resources and prompts are also federated where representable without changing their semantics. Resource templates that cannot be safely represented are surfaced in provider status rather than silently misrepresented.

## Namespace contract
Provider IDs match `[a-z][a-z0-9_-]*`.
Upstream capability names use `<provider>__<downstream-name>` with unsupported characters normalized to underscore.
Gateway-owned tools use the reserved `vgate_` prefix.
Duplicate upstream names are a startup/refresh error for the offending capability only; healthy capabilities remain available.

## Control tools
- `vgate_status`: provider state, transport, discovered capability counts, active profile.
- `vgate_refresh`: reconnect/re-discover providers and reconcile exported capabilities.
- `vgate_list_providers`: compact provider inventory.

## Provider lifecycle
`disabled -> connecting -> ready | degraded | error -> reconnecting -> ready/error`.

A provider connection is owned by VGate. Closing/restarting the gateway closes all downstream client transports. Stdio providers are child processes owned by their MCP client transport.

## Policy
Tool policy is evaluated after discovery and before export/call:
1. deny patterns win,
2. allow list, when present, is authoritative,
3. otherwise provider default policy applies.
A blocked tool is not exported upstream and cannot be called via a stale route.

## Configuration
Tracked: `config/vgate.example.json`.
Local active config: `vgate.local.json` (ignored), optional. If absent, VGate starts with zero downstream providers and only its control tools.
The current OpenAI tunnel profile remains `mcp-conf.yaml` (ignored) and launches the VGate stdio entrypoint.

## Plugin bootstrap
Local-only retained assets:
- `mcp-conf.yaml`
- `tunnel-client.exe`
- `local-secrets/`
- `runtime/` and `logs/` as ephemeral state
VGate-specific start/stop/status/restart scripts replace LConnect-named launchers.

## Acceptance
1. Unit tests cover config, namespace and policy.
2. Integration tests launch at least two real MCP fixture servers and prove discovery, collision-safe namespacing, routing, failure isolation and refresh.
3. One downstream fixture uses stdio; HTTP transport has a real integration test.
4. Upstream stdio E2E is exercised by an MCP client and proves proxied call roundtrip.
5. Current ChatGPT tunnel is restarted from the cleaned folder and the new VGate runtime is observed through the connected VGate plugin.
6. Repository is private at `funggier/VGate`, MIT licensed, CI green on exact pushed commit.
