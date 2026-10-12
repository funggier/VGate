# VGate

VGate is a deterministic MCP gateway that federates multiple downstream MCP servers behind one upstream MCP connection.

```text
ChatGPT / MCP Host
        |
        | MCP (stdio or Streamable HTTP)
        v
      VGate
  discovery / routing
  namespace / policy
  health / refresh
        |
   +----+--------+--------+
   |             |        |
 Roblox MCP   Blender   Unity MCP   ...
```

VGate does not contain an LLM. The upstream agent decides what to do; VGate discovers capabilities and routes each MCP operation to the correct provider.

## Current baseline

- Node.js 20+ / TypeScript
- MCP TypeScript SDK v2
- Upstream: stdio and Streamable HTTP
- Downstream: stdio and Streamable HTTP
- Dynamic tool discovery and JSON Schema proxying
- Prompt federation
- Static resource federation
- Provider-level failure isolation and request timeouts
- Hot capability refresh through `vgate_refresh`
- Namespaced tools: `<provider>__<tool>`
- Profiles and allow/deny tool policy
- Local-only configuration and Windows DPAPI tunnel credential support

## Quick start

```powershell
npm install
npm run typecheck
npm test
npm run build
Copy-Item config\vgate.example.json vgate.local.json
node dist\server-stdio.js
```

`vgate.local.json` is intentionally ignored by Git. Keep machine-specific paths and secrets out of tracked configuration.

## Configuration

See `config/vgate.example.json`. A provider can use either:

```json
{
  "transport": "stdio",
  "command": "some-mcp-server",
  "args": []
}
```

or:

```json
{
  "transport": "http",
  "url": "http://127.0.0.1:9000/mcp"
}
```

Environment references use `${env:NAME}`. Provider IDs become namespaces; for example `blender` + `get_objects_summary` is exported as `blender__get_objects_summary`.

## Gateway control tools

- `vgate_status` — current provider state and capability counts
- `vgate_list_providers` — compact provider inventory
- `vgate_refresh` — reconnect providers, rediscover capabilities, and reconcile the upstream surface

## Game-development providers

The example profile includes three independent MCP providers:

- **Roblox Studio** — official `StudioMCP.exe`; the included launcher resolves the newest installed Roblox Studio version at runtime so updates do not hard-code a version directory
- **Blender** — Blender Lab MCP server paired with the Blender MCP add-on; the example uses Blender MCP v1.0.3 and the add-on bridge on localhost:9876
- **Unity** — `mcpforunityserver==10.3.0` over stdio; editor-dependent operations require the matching Unity MCP package/editor bridge to be active. On Windows, choose an editor bridge port outside OS excluded TCP ranges.

These are configuration examples, not hard-coded VGate integrations. Any compatible MCP server can be added without changing VGate core.

## Windows tunnel lifecycle

For a local ChatGPT tunnel installation:

```text
Start-VGate.cmd
Stop-VGate.cmd
Restart-VGate.cmd
Status-VGate.cmd
```

The active tunnel profile `mcp-conf.yaml`, `tunnel-client.exe`, `vgate.local.json`, encrypted credentials, runtime state, and logs are local-only and excluded from Git. `Restart-VGate.cmd` launches a detached worker so the current tunnel can disconnect and be brought back even when the restart originated from the connection being replaced.

## Security

- stdio diagnostic logs are written to stderr, never MCP stdout.
- Tool deny rules override allow rules.
- An allow list, when present, is authoritative.
- Secrets should be supplied through environment references or the local DPAPI credential file.
- HTTP examples bind to loopback by default.
- VGate never executes provider-specific commands itself; operations are delegated through the selected downstream MCP server.

## Development

```powershell
npm run typecheck
npm test
npm run build
npm audit
```

Architecture and implementation records live under `docs/`.
