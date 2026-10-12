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
- Production artifact: 107 upstream tools, 18 static resources.
- Current ChatGPT tunnel target: `node "dist/server-stdio.js"`.
- tunnel-client: liveness PASS, readiness PASS, control-plane PASS.
- Detached self-restart: PASS.
- Real downstream profile `game-dev`:
  - Roblox: ready, 30 tools; real Studio discovery passed.
  - Blender: ready, 26 tools; real Blender calls passed.
  - Unity: ready, 48 tools, 18 static resources, 6 resource templates; real Unity Editor call passed.
- Remaining gate: exact-commit GitHub Actions, merge to main, exact-main/live verification, issue closure.
