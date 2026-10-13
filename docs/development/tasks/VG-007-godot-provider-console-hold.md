# VG-007 — Godot Provider & Operator Console Hold

**Status:** ACTIVE
**Activated:** 2026-10-13

## Goal

Extend the real `game-dev` VGate profile from Roblox + Blender + Unity to Roblox + Blender + Unity + Godot, and make the user-facing VGate Status/Stop CMD wrappers keep their result visible instead of closing immediately.

## Authoritative activation state

- repository: `funggier/VGate`
- branch: `main`
- activation HEAD: `b949da986ee8b42c1194bd0b092a57e18279916c`
- worktree: clean, `main == origin/main`
- VGate runtime: 0.1.0
- active profile: `game-dev`
- current providers:
  - roblox: ready / 30 tools
  - blender: ready / 26 tools
  - unity: ready / 48 tools / 18 resources / 6 templates
- current upstream surface: 3 VGate controls + 104 provider tools = 107 tools
- `Status-VGate.cmd` and `Stop-VGate.cmd` currently exit immediately after their PowerShell script and have no hold boundary

## Godot provider selection

Pinned bridge:

`@npgamedev/godot-mcp-server@1.0.3`

Rationale:

- stdio MCP bridge
- Windows/macOS/Linux desktop support
- Node.js 22+ compatible
- pairs with Godot MCP Toolkit editor plugin
- runs fully locally
- isolated VGate probe on this machine: provider ready, 36 tools, 2 prompts, 4 resources
- editor bridge can remain disconnected until a Godot project opens with the Toolkit enabled

Windows production launch:

`cmd.exe /d /c npx -y @npgamedev/godot-mcp-server@1.0.3`

## Scope

- add `godot` to tracked example `game-dev` profile
- add pinned Godot provider configuration
- add `godot` to local production `vgate.local.json`
- document Godot Toolkit prerequisite and bridge behavior
- add config regression coverage
- add reusable `scripts/Hold-VGateConsole.ps1`
- make `Status-VGate.cmd` and `Stop-VGate.cmd` hold results by default
- support `--no-hold` for automation
- preserve underlying PowerShell exit codes
- qualify Windows physical wrapper behavior
- exact-commit CI, production build, hot/deployed provider evidence, tunnel restart, refreshed provider inventory

## Non-goals

- do not install Godot Engine automatically
- do not edit any user's Godot project
- do not auto-install the Godot MCP Toolkit into projects
- do not change Roblox, Blender or Unity provider versions/configuration except profile membership formatting
- do not move/rewrite existing release/tag evidence
- no force push/reset/clean

## Closure gates

- isolated pinned Godot provider probe
- local typecheck + tests + build + audit
- Windows Status/Stop wrapper physical qualification
- exact-commit GitHub CI
- production `vgate.local.json` update
- production build/deploy preserving local tunnel secrets/runtime state
- detached VGate restart/readiness PASS
- live VGate provider inventory includes Godot ready with discovered capabilities
- legacy Roblox/Blender/Unity provider counts remain healthy
- final Git/worktree clean and source/runtime evidence recorded
