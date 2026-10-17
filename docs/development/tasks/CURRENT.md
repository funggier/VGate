# Current Task

**Task:** VG-012 — VGate v0.1.3 Tunnel Settings & Conditional Read Cache Release
**Status:** ACTIVE

## Qualified development baseline

VG-011 — Separated Tunnel Settings & Conditional Read Cache is **COMPLETE / DEPLOYED / LIVE GREEN**.

- implementation commit: `0b21cb4ddf89976ee8442fd4c3fa0dc6820e9079`
- closure commit: `926679e71f4102c6a97ca9938454ea1a483bcb4f`
- implementation CI: #20 / run `39026901721` / SUCCESS
- closure CI: #21 / run `39027095934` / SUCCESS
- current release-candidate version: **0.1.3**
- current live runtime before release activation: **0.1.2**
- live profile: `game-dev`
- separated Tunnel / Organization / health-port settings: LIVE
- DPAPI Runtime API key credential: API-key-only
- conditional cache: LIVE on `vgate_status` and `vgate_list_providers`
- ChatGPT cache hit and TTL=0 revalidation: PASS
- Roblox: ready / 30 tools
- Blender: ready / 26 tools
- Unity: ready / 48 tools / 18 resources / 6 templates
- Godot: ready / 36 tools / 2 prompts / 4 resources
- MonoGame: ready / 7 tools

Release task: `docs/development/tasks/VG-012-v0.1.3-tunnel-cache-release.md`

Published tags/releases v0.1.0, v0.1.1 and v0.1.2 remain immutable.
