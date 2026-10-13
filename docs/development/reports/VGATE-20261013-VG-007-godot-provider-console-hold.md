# VG-007 — Godot Provider & Operator Console Hold Qualification

Date: 2026-10-13

Status: **DONE / DEPLOYED / LIVE GREEN**

## Summary

VG-007 extends the production `game-dev` profile from Roblox + Blender + Unity to Roblox + Blender + Unity + Godot, and hardens the user-facing Status/Stop CMD wrappers so result windows remain readable instead of closing immediately.

## Implementation

Primary implementation commit:

`b95553646df85a2c0de2e92e58bbe027a8c04404`

Deployment-found hardening commit:

`b6a30d9be6868e808ab4081fe075d98449686f1d`

Godot provider:

- pinned bridge: `@npgamedev/godot-mcp-server@1.0.3`
- Windows production launch: `cmd.exe /d /c npx -y @npgamedev/godot-mcp-server@1.0.3`
- provider namespace: `godot`
- production profile: `game-dev`

Operator wrappers:

- added `scripts/Hold-VGateConsole.ps1`
- `Status-VGate.cmd` and `Stop-VGate.cmd` now hold by default
- buffered console keys are drained before waiting
- redirected/non-interactive input falls back to a bounded 15-second hold
- `--no-hold` bypasses the hold for automation
- underlying PowerShell exit codes are preserved

Config hardening:

- `loadGatewayConfig()` now tolerates a UTF-8 BOM before JSON parsing
- regression coverage added for BOM-prefixed local configuration
- this hardening was discovered during real production deployment when Windows PowerShell wrote `vgate.local.json` with a BOM

## Qualification

Local qualification after Godot/provider/operator changes:

- TypeScript typecheck: PASS
- Vitest: 19/19 PASS
- production build: PASS
- npm audit: 0 vulnerabilities
- Windows Status/Stop wrapper fixture: PASS
- default wrapper hold remained alive after 5 seconds
- `Status-VGate.cmd --no-hold`: preserves exit code
- `Stop-VGate.cmd --no-hold`: preserves exit code
- redirected-input fallback hold: PASS

After BOM hardening:

- TypeScript typecheck: PASS
- Vitest: 20/20 PASS
- production build: PASS
- npm audit: 0 vulnerabilities
- BOM-prefixed config regression: PASS
- git diff check: PASS

## Exact-commit CI

Implementation CI:

- workflow: CI
- run: `38338733959`
- run number: #5
- exact SHA: `b95553646df85a2c0de2e92e58bbe027a8c04404`
- conclusion: SUCCESS

BOM-hardening CI:

- workflow: CI
- run: `38339346499`
- run number: #6
- exact SHA: `b6a30d9be6868e808ab4081fe075d98449686f1d`
- conclusion: SUCCESS

## Production VGate evidence

Live profile after deployment/restart:

- gateway: VGate 0.1.0
- active profile: `game-dev`
- Roblox: ready / 30 tools
- Blender: ready / 26 tools
- Unity: ready / 48 tools / 18 resources / 6 resource templates
- Godot: ready / 36 tools / 2 prompts / 4 resources
- provider tool total: 140
- VGate control tools: 3
- effective upstream tool total: 143
- tunnel process PID at final qualification: 8380
- liveness: 200 live
- readiness: 200 ready
- control-plane health: PASS

Production local config:

- `vgate.local.json` includes `godot` in `game-dev`
- production config was rewritten UTF-8 no-BOM after the initial deployment failure
- current production config SHA-256 after repair: `663664f0552822d546b821d2f5433c5d4ee53d2a4bc0b7d0c7a34c425e748c4a`

## Physical Godot project qualification

After VG-007 activation, the user explicitly requested creation of a real MCP-enabled Godot project for physical qualification. This superseded the original non-goal of not editing a user project for this specifically authorized target.

Project:

`N:\WorkSpace\GodotGameProject\GodotMCPProject`

Engine:

`N:\WorkSpace\GodotEngine\Godot_v4.7.2-stable_mono_win64\Godot_v4.7.2-stable_mono_win64_console.exe`

Engine version:

`4.7.2.stable.mono.official.ed1daf0bf`

Toolkit:

- Godot MCP Toolkit v1.0.3
- release asset SHA-256 verified: `01f9aea9ef48ebf748d3073fed8ec1b42b251f5533e615caf1acaefcd8271c77`
- addon installed at `addons/godot_mcp_toolkit`
- 276 addon files copied
- plugin enabled in `project.godot`

Editor evidence:

- Godot editor process started successfully
- toolkit log: `[MCPServer] listening on 127.0.0.1:6560`
- registry log: `[MCPRegistry] registered n:/workspace/godotgameproject/godotmcpproject on port 6560`
- MCP bridge connected and authenticated against Godot 4.7.2
- live `project_get_settings`: PASS
- live `scene_get_tree`: PASS
- scene source: `res://main.tscn`
- root node: `GodotMCPProject` / `Node2D`
- child node: `Title` / `Label`
- editor left running for user use

The project intentionally does not require a per-project `.mcp.json` for VGate because VGate owns the MCP client/provider configuration. The toolkit plugin and VGate provider are the active integration path.

## Physical Status wrapper qualification

Actual production `Status-VGate.cmd`:

- `--no-hold`: exit code 0
- process: running
- liveness: PASS
- readiness: PASS
- control-plane health: PASS
- default wrapper remained alive after 10.8 seconds
- redirected-input route displayed the configured 15-second fallback
- completed normally after 17.5 seconds with exit code 0

## LConnect correction

The earlier mistaken LCN-061 LConnect scope was fully reverted as an additive corrective commit:

`da542573914373671cdde3412a593bbd0564fd7a`

- LConnect CI #188 / run `38338598685`: SUCCESS
- runtime restored to 1.3.1 / 154 tools
- source/installed state returned to the pre-LCN-061 behavior
- incorrect LCN-061-only files removed from the installed tree
- historical LConnect release/tag evidence was not rewritten

## Final state

VG-007 is COMPLETE / DEPLOYED / LIVE GREEN. The v0.1.0 baseline remains immutable; VG-007 is post-baseline mainline work.
