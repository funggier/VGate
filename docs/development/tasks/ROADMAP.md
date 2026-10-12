# VGate Roadmap

| ID | Task | Status |
|---|---|---|
| VG-001 | Freeze architecture + clean-room boundary | DONE |
| VG-002 | Config, namespace, policy core | DONE |
| VG-003 | Downstream stdio/HTTP discovery and routing | DONE |
| VG-004 | Upstream federation, refresh, resources/prompts, health | DONE |
| VG-005 | Current tunnel bootstrap migration + self-restart | DONE |
| VG-006 | Full qualification, CI, GitHub delivery | ACTIVE |

## Live qualification snapshot — 2026-10-13

- Local unit/integration/E2E: 15/15 tests PASS.
- TypeScript typecheck: PASS.
- Production build: PASS.
- npm audit: 0 vulnerabilities.
- Current ChatGPT tunnel target: `node "dist/server-stdio.js"`.
- tunnel-client health: live/ready/control-plane PASS.
- Real downstream profile `game-dev`:
  - Roblox: ready, 30 tools.
  - Blender: ready, 26 tools.
  - Unity: ready, 48 tools, 18 static resources, 6 resource templates detected.
- Remaining gate: push exact commit, observe GitHub Actions on that commit, merge to main, then re-run runtime verification.
