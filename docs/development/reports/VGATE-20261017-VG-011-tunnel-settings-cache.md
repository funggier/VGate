# VG-011 â€” Separated Tunnel Settings & Conditional Read Cache

**Date:** 2026-10-17
**Status:** COMPLETE / DEPLOYED / LIVE GREEN

## Scope

VG-011 aligned VGate's local ChatGPT tunnel lifecycle with the connection-management baseline proven in Base-Plugin-for-ChatGPT and LConnect/BConnect, while adding a bounded conditional cache for VGate-owned read-only control responses.

Provider federation semantics and published releases were intentionally left unchanged.

## Implementation

### Separated tunnel connection state

VGate now stores local tunnel state in two independent locations:

- `local-secrets\vgate-settings.json`
  - Tunnel ID
  - Organization ID
  - health port
- `local-secrets\vgate-tunnel.json.enc`
  - Runtime API key only
  - Windows DPAPI / CurrentUser

`mcp-conf.yaml` is generated from the separated connection settings.

New operator commands:

- `Setup-VGate.cmd`
- `Clear-VGateSettings.cmd`

Clear modes:

- `credential` â€” API key only
- `connection` â€” Tunnel ID / Organization ID / health port + generated tunnel profile
- `all` â€” credential + connection settings + generated runtime/log state

Existing combined VGate credentials remain readable for one-time migration. The deployed production credential was migrated successfully and rewritten as API-key-only.

### Conditional read cache

The VGate-owned read-only tools:

- `vgate_status`
- `vgate_list_providers`

now accept:

- `known_digest`
- `cache_max_age_ms`

Responses expose SHA-256 result metadata including:

- `result_digest_sha256`
- `not_modified`
- `result_suppressed`
- `cache_hit`
- `execution_skipped`
- `cache_age_ms`
- `content_retained`

The cache retains digest/size/timestamp metadata only and is bounded in memory. Result content is never retained.

`vgate_refresh` always executes and clears the VGate control-read cache.

Downstream provider tools, prompts, and resources are not cached by this layer.

## Qualification

Implementation commit:

`0b21cb4ddf89976ee8442fd4c3fa0dc6820e9079`

GitHub Actions:

- workflow: CI
- run: #20
- run ID: `39026901721`
- exact head SHA: implementation commit above
- Linux `qualify`: SUCCESS
- Windows `windows-lifecycle`: SUCCESS
- overall conclusion: SUCCESS

Local qualification:

- TypeScript typecheck: PASS
- Vitest: 12 files / 37 tests PASS
- production build: PASS
- npm audit: 0 vulnerabilities
- PowerShell syntax: PASS
- connection settings smoke: PASS
- tunnel lifecycle smoke: PASS
- git diff check: PASS

Cache-specific tests cover:

- digest generation
- positive-TTL execution short-circuit
- TTL=0 fresh revalidation
- changed-content invalidation
- errors not cached
- metadata-only retention contract
- bounded eviction
- refresh invalidation

## Live deployment

VGate was restarted from the repository/runtime root:

`T:\Sanbox\openclawspace\VGate-mcp`

Live migration evidence:

- separated connection settings created: PASS
- generated tunnel profile: PASS
- DPAPI credential decrypt: PASS
- Runtime API key configured: PASS
- legacy Organization ID retained in credential: NO
- health port retained: 18030
- `vgate.local.json` SHA-256 unchanged:
  `7e4dfa330655ae75e92778c6c2cdb7612e11883fc355beb51899baa71fbac090`

Live provider qualification:

- active profile: `game-dev`
- Roblox: ready / 30 tools
- Blender: ready / 26 tools
- Unity: ready / 48 tools / 18 resources / 6 templates
- Godot: ready / 36 tools / 2 prompts / 4 resources
- MonoGame: ready / 7 tools

Live conditional-cache evidence for `vgate_status`:

- initial payload: 1024 chars
- positive TTL:
  - `not_modified=true`
  - `result_suppressed=true`
  - `cache_hit=true`
  - `execution_skipped=true`
  - `returned_chars=0`
- TTL 0:
  - `not_modified=true`
  - `result_suppressed=true`
  - `cache_hit=false`
  - `execution_skipped=false`
  - `returned_chars=0`

This proves the end-to-end path:

ChatGPT connector â†’ VGate control tool â†’ digest metadata cache â†’ duplicate payload suppression / optional safe execution skip.

## Release boundary

No release was created for VG-011.

Published tags/releases remain immutable:

- v0.1.0
- v0.1.1
- v0.1.2
