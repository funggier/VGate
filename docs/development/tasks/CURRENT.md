# Current Task

**Task:** VG-011 â€” Separated Tunnel Settings & Conditional Read Cache
**Status:** ACTIVE

## Objective

Separate VGate tunnel identity/configuration from the Runtime API key, add deterministic Setup/Clear lifecycle commands, and add bounded conditional caching for VGate-owned read-only control results while preserving the current game-dev provider federation.

## Baseline

- repository: `funggier/VGate`
- local root: `T:\Sanbox\openclawspace\VGate-mcp`
- branch: `main`
- activation HEAD: `83aace4be6047a003fbd6eebb834798cd9631d9b`
- local main == origin/main at activation
- live VGate: v0.1.2
- live profile: game-dev
- providers at activation:
  - Roblox 30 tools
  - Blender 26 tools
  - Unity 48 tools / 18 resources / 6 templates
  - Godot 36 tools / 2 prompts / 4 resources
  - MonoGame 7 tools

Published tags/releases v0.1.0, v0.1.1 and v0.1.2 are immutable and out of scope.
