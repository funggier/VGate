# VGate Roadmap

| ID | Task | Status |
|---|---|---|
| VG-001 | Freeze architecture + clean-room boundary | DONE |
| VG-002 | Config, namespace, policy core | DONE |
| VG-003 | Downstream stdio/HTTP discovery and routing | DONE |
| VG-004 | Upstream federation, refresh, resources/prompts, health | DONE |
| VG-005 | Current tunnel bootstrap migration + self-restart | DONE |
| VG-006 | Full qualification, CI, GitHub delivery | DONE |
| VG-007 | Godot provider + Status/Stop console hold | DONE |
| VG-008 | v0.1.1 Godot Integration Release | DONE / PUBLISHED / LIVE GREEN |
| VG-009 | MonoGame Provider Discovery & Integration | DONE / DEPLOYED / LIVE GREEN |
| VG-010 | v0.1.2 MonoGame Integration Release | DONE / PUBLISHED / DEPLOYED / LIVE GREEN |
| VG-011 | Separated Tunnel Settings & Conditional Read Cache | DONE / DEPLOYED / LIVE GREEN |
| VG-012 | v0.1.3 Tunnel Settings & Conditional Read Cache Release | DONE / PUBLISHED / DEPLOYED / LIVE GREEN |
| VG-013 | CLIP STUDIO PAINT Provider & Live Qualification | DONE / DEPLOYED / LIVE GREEN |
| VG-014 | v0.1.4 CLIP STUDIO PAINT Provider Release | DONE / PUBLISHED / DEPLOYED / LIVE GREEN |
| VG-015 | Portable per-machine Provider Connection Registry | DONE / DEPLOYED / LIVE GREEN |
| VG-016 | v0.1.5 Portable Connections Release + CGate Sync | DONE / PUBLISHED / DEPLOYED / CGATE SYNC GREEN |

## v0.1.0 closure — 2026-10-13

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
- Exact qualified implementation SHA: `cff83dc54fb5710de598ebb8949360d57d3f75bc`.
- GitHub Actions exact-SHA qualification: run `38323222718` / job `qualify` — SUCCESS.
- `main` was fast-forwarded to the exact qualified implementation SHA before this closure record.

VG-007 is COMPLETE / DEPLOYED / LIVE GREEN: Godot is federated into `game-dev` at 36 tools / 2 prompts / 4 resources; Status/Stop wrappers hold results reliably; BOM-prefixed local config is tolerated. VG-008 is COMPLETE / PUBLISHED / DEPLOYED / LIVE GREEN as v0.1.1 at release commit `1fcb0b577ac6da091a451d44bd283210522072c8`, CI #8 SUCCESS, with clean-install/overlay/download-back qualification PASS. Report: `docs/development/reports/VGATE-20261013-v0.1.1-release.md`.
## VG-009 closure - 2026-10-13

- Dedicated VGate-owned MonoGame stdio provider: 7 tools.
- MonoGame templates: 3.8.6; .NET SDK: 10.0.401.
- Qualification DesktopGL project/content build: PASS; Content Builder 1 succeeded / 0 failed.
- VS Code parity verified with C# Dev Kit, C#, and MonoGame for VS Code.
- Local production checkout: typecheck PASS; 32/32 tests PASS; build PASS; npm audit 0 vulnerabilities.
- Exact qualified implementation SHA: c099d3a82391562a216416ede6028e1ada9cd6c0.
- Main GitHub Actions CI #16 / run 38399029024: SUCCESS on the exact SHA.
- Live production profile: Roblox 30, Blender 26, Unity 48 + 18 resources + 6 templates, Godot 36 + 2 prompts + 4 resources, MonoGame 7; all ready.
- Tunnel liveness/readiness/control-plane: PASS.
- Existing v0.1.0/v0.1.1 tags/releases unchanged; no v0.1.2 release created.
- Report: docs/development/reports/VGATE-20261013-VG-009-qualification.md.

## v0.1.2 closure - 2026-10-13

- VG-010 COMPLETE / PUBLISHED / DEPLOYED / LIVE GREEN.
- exact release commit: 01de70a6325aab2ecdb2d13e21e34fe00107ddd9.
- exact release CI: #18 / run 38402089475 / SUCCESS.
- annotated tag object: b6621674f708e46bf077dd3ae2dabc6fdc741106.
- GitHub Release: https://github.com/funggier/VGate/releases/tag/v0.1.2.
- repository visibility: PUBLIC.
- production runtime: VGate 0.1.2 with five providers ready.
- release artifacts and download-back SHA-256 verification: PASS / mismatch count 0.
- v0.1.0 and v0.1.1 remain unchanged.
- report: docs/development/reports/VGATE-20261013-v0.1.2-release.md.

## v0.1.3 release closure - 2026-10-17

- VG-011 is COMPLETE / DEPLOYED / LIVE GREEN.
- Published release: v0.1.3.
- Public gateway control surface unchanged: vgate_status / vgate_list_providers / vgate_refresh.
- Five-provider game-dev federation remains unchanged.
- Exact release-commit CI, live 0.1.3 activation, cache requalification, immutable tag and three checksum-verified assets all passed.

## v0.1.4 release closure - 2026-10-18

- VG-013 is COMPLETE / DEPLOYED / LIVE GREEN.
- VG-014 is COMPLETE / PUBLISHED / DEPLOYED / LIVE GREEN.
- Published release: v0.1.4.
- Exact release commit: ad636549e06e71ecc093aaee2775dc241a51ed48.
- Exact release CI: #24 / run 39053548513 / SUCCESS.
- Six-provider game-dev federation is live and ready.
- CLIP STUDIO PAINT 4.0.10 provider: 12 tools, direct status/capture PASS.
- Gateway and Clip Studio conditional-cache requalification: PASS.
- Clean tagged-source and clean release-ZIP install qualification: PASS.
- Three release assets published and download-back SHA-256 verification passed with 0 mismatches.
- Report: docs/development/reports/VGATE-20261018-VG-014-v0.1.4-release.md.

## VG-015 closure — 2026-10-29

- Typed machine-local provider settings registry, safe discover/configure/forget/invoke tools: deployed.
- Exact implementation commit: e7b171c487e99462cf1da6491b47cd2b00abfbe6.
- CI #26 / run 40864394445: SUCCESS.
- Full 48/48 tests, build, typecheck, smoke and dependency audit: PASS.
- CLIP STUDIO PAINT 4.0.10 real discovery/status/capture: PASS.
- Six-provider profile and tunnel control-plane: LIVE GREEN.
- No new release/tag created; v0.1.4 remains immutable.
- Report: docs/development/reports/VGATE-20261029-VG-015-provider-registry.md.