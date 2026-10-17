# VG-011 â€” Separated Tunnel Settings & Conditional Read Cache

**Status:** ACTIVE
**Activated:** 2026-10-17

## Goal

Bring VGate's local ChatGPT tunnel lifecycle and repeated read-only control responses to the same operational baseline proven in Base-Plugin-for-ChatGPT and LConnect/BConnect, without changing VGate provider federation semantics.

## Acceptance

### Tunnel lifecycle
- Tunnel ID / Organization ID / health port are stored separately from the Runtime API key.
- Runtime API key remains Windows DPAPI / CurrentUser protected and new writes are API-key-only.
- Existing VGate combined credentials remain readable for one-time migration.
- Existing LConnect-format legacy credential import remains supported.
- `Setup-VGate.cmd` configures Tunnel ID, API key, Organization ID, and health port.
- `mcp-conf.yaml` is generated automatically from local settings.
- `Clear-VGateSettings.cmd` supports credential / connection / all scopes.
- Start asks only for missing values in interactive mode and refuses clearly in non-interactive mode.
- Restart preflight requires both connection settings and a decryptable API key.

### Context efficiency
- `vgate_status` and `vgate_list_providers` accept `known_digest` and `cache_max_age_ms`.
- Successful read-only results expose SHA-256 digest metadata.
- Positive TTL may short-circuit repeated safe reads using digest-only metadata.
- TTL 0 revalidates the live snapshot and suppresses an unchanged payload.
- `vgate_refresh` always executes and invalidates control-read cache metadata.
- Proxied provider tools/prompts/resources are not cached by this layer.
- Cache never retains result content and is bounded in memory.

### Qualification
- Existing provider configuration and five-provider `game-dev` profile remain unchanged.
- Local tests/typecheck/build/audit pass.
- Windows PowerShell lifecycle smoke tests pass.
- Exact pushed commit CI passes on Linux qualification and Windows lifecycle jobs.
- Live VGate and all providers are requalified after deployment.

## Non-goals

- No provider tool/schema changes beyond the VGate-owned read-only control tools.
- No caching of downstream actions.
- No release/tag movement.
- No changes to published v0.1.0, v0.1.1, or v0.1.2 releases.
