# VG-015 — Portable Machine-local Provider Registry Qualification

**Date:** 2026-10-29
**Result:** COMPLETE / DEPLOYED / LIVE GREEN (unreleased development)

## Goal and architecture

Eliminate per-PC hardcoded installation paths, workspace roots and editor bridge parameters from the VGate provider integration workflow without enabling arbitrary MCP-command editing.

- Typed per-provider configuration overlay; source configuration remains a trusted template.
- Persistent machine-local registry at `local-secrets/provider-connections.json` (Git-ignored).
- Managed `configure`, `discover`, `connections`, `forget`, and stable `invoke` MCP tools.
- Dynamic reload of provider connection state from disk, serialized mutations and cache invalidation.
- Missing environment references disable just the affected provider instead of bringing down VGate.
- Explicit disabled tombstone prevents stale paths in older `vgate.local.json` from reconnecting after forget.
- No arbitrary command/args/cwd/header/URL/environment editing through management tools.
- Existing six-provider profile and gateway conditional-read cache retained.

Full design and use instructions: `docs/architecture/VG-015-PROVIDER-CONNECTION-REGISTRY.md`.

## Scope per provider

- CLIP STUDIO PAINT: executablePath or automatic Windows detection (running process / App Paths).
- MonoGame: allowedRoot (validated directory).
- Godot: projectPath (validated directory).
- Blender: loopback host and port.
- Unity: existing editor MCP bridge discovery; enable/forget in VGate registry.
- Roblox: existing Studio launcher discovers installed version; enable/forget in VGate registry.

Application-specific discovery beyond the current CLIP STUDIO Windows implementation is deliberately not claimed. Other MCP integrations can be extended through the typed provider catalog.

## Test evidence

- Initial test-first registry tests failed with the expected missing implementation; registry implemented and tests passed.
- Initial runtime administration test failed with missing controller; controller and live reload implemented and tests passed.
- Dynamic tool-addition e2e initially failed with MCP SDK v2 error `Cannot register capabilities after connecting to transport`. Resolved with frozen current-session tool catalog and stable `vgate_provider_invoke` under the same provider tool policy; configuration result reports whether client reconnect is required.
- Full local suite: **17 files / 48 tests PASS**.
- TypeScript typecheck: PASS.
- Production build: PASS.
- Connection settings smoke: PASS.
- Windows tunnel lifecycle smoke: PASS.
- `git diff --check`: PASS.
- Production dependency audit: 0 vulnerabilities after pinning `@modelcontextprotocol/node@2.1.1` and overriding `@hono/node-server@2.1.5` to address GHSA-rmxm-3fg6-px4f. HTTP/stdio regression tests passed with this dependency.

### Persistence E2E

Temporary isolated runtime (not the user's production settings):

1. Start VGate with an unconfigured Clip Studio provider: state disabled; other tools available.
2. Call `vgate_provider_configure` via MCP with a valid fixture executable path.
3. Provider becomes ready; invoke newly added downstream tool through `vgate_provider_invoke` successfully.
4. Exit/start new VGate process with the same registry: provider restored and ready.
5. Call `vgate_provider_forget` through MCP.
6. Exit/start another VGate process: provider remains disabled and path is not retained in registry.

Additional tests reject unknown providers, arbitrary command fields, non-loopback bridge hosts, invalid ports, non-existent files and missing directories.

### Real-machine discovery/migration

- Actual running CLIP STUDIO PAINT was found automatically from the running process (not a hardcoded install path).
- Existing machine-local valid connection values for **clipstudio**, **monogame**, **godot**, and **blender** were migrated to the ignored provider registry.
- Existing `vgate.local.json`, API-key credential, tunnel settings and immutable release tags were preserved.
- No raw machine-specific settings were committed into Git.

## Git / CI

- Implementation commit: `e7b171c487e99462cf1da6491b47cd2b00abfbe6`
- GitHub Actions exact-commit CI #26 / run `40864394445`: SUCCESS
  - `qualify` (Linux): SUCCESS
  - `windows-lifecycle` (Windows): SUCCESS

## Live deployment

Production VGate was restarted from current `main` (version string still 0.1.4, because no new release has been tagged).

Post-restart:

- Roblox: ready / 30 tools
- Blender: ready / 26 tools
- Unity: ready / 48 tools
- Godot: ready / 36 tools
- MonoGame: ready / 7 tools
- CLIP STUDIO PAINT: ready / 12 tools
- Liveness: HTTP 200 live
- Readiness: HTTP 200 ready
- Tunnel control-plane health: PASS
- Real CLIP STUDIO PAINT v4.0.10 status: PASS
- Real CLIP STUDIO PAINT window capture: PASS

Existing ChatGPT sessions still have their prior tool catalog. Reconnect/refresh the VGate plugin to see new individual `vgate_provider_*` tools.

## Release boundary

This is an **unreleased development change on `main`**. The previously published VGate `v0.1.4` tag/release and all earlier tags/releases remain immutable. A future versioned release can package this feature after user request.
