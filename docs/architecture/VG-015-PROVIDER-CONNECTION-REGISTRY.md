# VG-015 — Portable per-machine provider connection registry

**Date:** 2026-10-29
**Status:** Development implementation

## Goal

Keep the VGate MCP provider *template* portable between machines, while storing machine-specific
application paths, local project roots and loopback bridge settings outside the tracked repository.
A ChatGPT user can ask VGate to inspect supported provider requirements, configure a provider,
remember the settings after a restart, and forget the settings later.

## Architecture

```text
Git-tracked provider templates (config/vgate.example.json)
        +
Machine-local provider registry (local-secrets/provider-connections.json)
        |
        v
validated overlay -> ProviderManager -> downstream MCP providers
        ^
        |
vgate_provider_connections / discover / configure / forget / refresh
```

The configured MCP *server launch command* remains in the trusted operator-controlled config.
MCP management tools cannot replace `command`, `args`, `cwd`, arbitrary environment variables,
or HTTP provider URLs. Managed settings are constrained by an explicit program catalog.

## Supported setup fields

| Provider | Connection fields | Discovery / bridge strategy |
| --- | --- | --- |
| `clipstudio` | `executablePath` | Detect a running CLIPStudioPaint.exe or Windows App Paths/uninstall registration; otherwise provide an absolute existing path |
| `monogame` | `allowedRoot` | Choose an existing project parent directory |
| `godot` | `projectPath` | Choose an existing project directory; the Godot editor MCP toolkit must still be installed and active |
| `blender` | `host`, `port` | Detect a running/registered Blender executable; use the known addon MCP loopback port (no port scan), or provide it manually |
| `unity` | none | Detect running/registered Unity editor; existing Unity MCP connector must still discover its editor bridge |
| `roblox` | none | Detect running/registered Roblox Studio; the existing launcher still resolves the installed Studio version |

The catalog is intentionally typed. Additional applications and bridge-specific settings require
a reviewed adapter to be added to the catalog, rather than accepting an arbitrary command from
a remotely callable MCP operation.

## MCP workflow

1. Call `vgate_provider_connections` to inspect provider states, recognized fields and previously saved entries.
2. Call `vgate_provider_discover` with `provider: "clipstudio"` to locate a running/registered installation or obtain setup requirements.
3. Call `vgate_provider_configure`:
   - `{ "provider": "clipstudio", "autoDetect": true }`, or supply `executablePath`
   - `{ "provider": "monogame", "allowedRoot": "T:\\Space\\Projects" }`
   - `{ "provider": "godot", "projectPath": "N:\\WorkSpace\\GodotGameProject" }`
   - `{ "provider": "blender", "host": "127.0.0.1", "port": 9876 }`
   - `{ "provider": "unity" }` or `{ "provider": "roblox" }`
4. VGate validates values, writes the local registry atomically, reconnects providers,
   rebuilds its discovery inventory and invalidates gateway control-read cache.
   The response includes `clientReconnectRequired` when the existing ChatGPT tool catalog
   cannot expose newly added names without reconnecting.
5. New tools are immediately callable through `vgate_provider_invoke` using their full
   upstream name (e.g. `clipstudio__application_status`); reconnect ChatGPT to expose
   newly added individual tool names.
6. Restart VGate: it reloads the saved registry automatically.
7. Call `vgate_provider_forget` with provider ID to remove the saved machine-specific values
   and disable that provider. The explicit disabled record prevents a stale `vgate.local.json`
   path from unexpectedly restoring access. Configure again to re-enable.

## Deployment on another machine

1. Install VGate dependencies and the desired downstream application/MCP server.
2. Copy `config/vgate.example.json` to the untracked `vgate.local.json`, select the desired profile,
   and configure provider server commands according to the target machine's installed toolchain.
3. Start VGate. A provider requiring an unset `${env:...}` reference shows `disabled` with a
   missing-configuration message; it does not bring down the other providers.
4. Ask ChatGPT to discover/configure the provider. VGate stores its machine-specific values in
   `local-secrets/provider-connections.json` (or `VGATE_PROVIDER_SETTINGS` if set locally).
5. Save this local state through your device backup policy if desired; never publish it as a
   repository artifact. Reconnect the ChatGPT plugin when new tool names need to be re-discovered.

The local registry is not a portable bundle of executable files, licenses, SDKs or credentials.
Those prerequisites must be installed separately on the target machine.

## Security and lifecycle

- The registry is ignored by Git; writes are atomic and newly created files use mode 0600
  on platforms that honor POSIX modes.
- The registry only stores non-secret program paths and local bridge parameters. Do not put
  API keys/tokens in it. VGate's existing DPAPI tunnel credential storage remains separate.
- User-controlled program paths are validated as existing local paths, and CLIP STUDIO PAINT
  must use the expected executable filename; validation does not provide a code-signing guarantee.
- Only local loopback endpoints are accepted for managed Blender connections.
- Unknown providers, unexpected field names, invalid ports, missing directories and missing
  executables are rejected.
- Concurrent setup/forget requests are serialized.
- Corrupt registry data fails closed with an explicit error rather than silently overwriting
  the user's settings.
- The original static provider command templates remain in source/config; the registry is a
  machine-specific overlay, not a remote code execution configuration editor.

## Limitations

- Windows local discovery probes known process names, App Paths, PATH and Uninstall registrations for all six supported programs. A detected program does **not** prove its MCP bridge or project plugin is active. No full-disk search is attempted. Portable builds and unusual installations may require manual configuration.
- MonoGame requires a validated workspace root; Godot needs an unambiguous project directory with project.godot. Blender requires an enabled addon and a known loopback port. Unity and Roblox use their own MCP bridge/launcher.
- Saving a provider setting reconnects the currently selected provider profile. Other providers
  remain configured but experience a brief reconnect during this operation.
- MCP SDK v2 rejects adding brand-new individual tool registrations to an already-connected
  transport. VGate keeps the current catalog stable, exposes `vgate_provider_invoke`
  for immediate policy-checked calls, and reports `clientReconnectRequired`.
  Reconnect the ChatGPT plugin to expose newly added named proxy tools.
- This feature does not scan the whole disk or execute unknown installers/applications.