# VG-013 — CLIP STUDIO PAINT Provider & Live Qualification

Status: **COMPLETE / DEPLOYED / LIVE GREEN**

## Objective

Federate the locally installed CLIP STUDIO PAINT 4.0.10 into VGate as an independent provider.

The gateway core must remain generic. All Clip Studio-specific process, window, input and capture behavior belongs to the dedicated provider.

## Design

Provider namespace: `clipstudio__*`

Transport: stdio

Runtime components:

- `src/providers/clipstudio/server.ts` — MCP surface
- `src/providers/clipstudio/service.ts` — bounded service contract
- `src/providers/clipstudio/helper.ts` — PowerShell process bridge
- `scripts/clipstudio-win.ps1` — guarded Win32 automation helper

Initial tool surface:

1. `application_status`
2. `application_launch`
3. `application_focus`
4. `open_file`
5. `save_document`
6. `undo`
7. `redo`
8. `key_press`
9. `shortcut`
10. `mouse_click`
11. `mouse_scroll`
12. `capture_window`

## Safety / determinism rules

- keyboard input is delivered only after exact foreground-window verification;
- supported virtual keys are allowlisted;
- mouse coordinates must be inside the current Clip Studio main-window rectangle;
- opening a file requires an existing absolute path;
- screenshot output is file-backed by default to avoid large MCP payloads;
- inline screenshot bytes are opt-in and bounded;
- application status uses SHA-256 conditional reads and the same digest-only cache contract as VGate control reads;
- provider-specific failures must not take down VGate or the other providers.

## Machine qualification target

Executable:

`C:\DATAstore\CELSYS\CLIP STUDIO 1.5\CLIP STUDIO PAINT\CLIPStudioPaint.exe`

Expected product:

- ProductName: CLIP STUDIO PAINT
- ProductVersion: 4.0.10

## Completion criteria

VG-013 closes only after source tests, production build, live VGate refresh, conditional cache checks and at least one real Clip Studio status + capture/open/control qualification pass are observed.

## Closure — 2026-10-18

Implementation commit: `4dd3822cd972ec4ae5e74d295674de523175ea03`

Qualification:

- TypeScript typecheck: PASS
- full Vitest suite: 41/41 PASS across 14 test files
- production build: PASS
- production dependency audit: 0 vulnerabilities
- real CLIP STUDIO PAINT 4.0.10 status/open/capture/input qualification: PASS
- provider digest/TTL conditional read cache: PASS
- guarded invalid-key and out-of-window mouse rejection: PASS
- live VGate production restart: PASS
- six-provider `game-dev` inventory: all ready; `clipstudio` exposes 12 tools
- VGate gateway conditional-read cache after provider addition: positive TTL and TTL=0 revalidation PASS
- tunnel liveness/readiness/control-plane health: PASS

The current ChatGPT session was opened before the new provider existed, so its client-side tool catalog does not dynamically contain `clipstudio__*`. Refreshing/reconnecting VGate in ChatGPT is required to load the new names; the VGate runtime itself has already discovered the provider and reports it ready.

No existing tag or release was modified, and no new release was created.
