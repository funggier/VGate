# VG-015 — Portable Machine-local Provider Registry

**Status:** COMPLETE / DEPLOYED / LIVE GREEN

Goal: replace per-PC hardcoded integration values with a validated persistent local overlay,
allow chat-driven connection/discovery/forget operations, and keep release tags `v0.1.0`–`v0.1.4` unchanged.

Key implementation files: `src/provider-settings.ts`, `src/provider-connections.ts`,
`src/providers/manager.ts`, `src/gateway.ts`, `src/server-stdio.ts`, `src/server-http.ts`,
`src/http.ts`.

Acceptance:
- [x] Data store, validation, persistence, forget, and live-reload tests
- [x] Windows CLIP STUDIO PAINT discovery against real process
- [x] Stdio gateway exposed management tools test
- [x] Local full qualification and clean source check
- [x] Deploy live and qualify persistence/remove on a safe test provider
- [x] Commit/push development state and capture evidence

Specification: `docs/architecture/VG-015-PROVIDER-CONNECTION-REGISTRY.md`.
Evidence: `docs/development/reports/VGATE-20261029-VG-015-provider-registry.md`.

Implementation commit: `e7b171c487e99462cf1da6491b47cd2b00abfbe6`.
Exact-commit CI #26: SUCCESS. No new release/tag was created.
