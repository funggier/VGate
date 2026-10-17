# VG-013 — CLIP STUDIO PAINT Provider & Live Qualification

Status: **ACTIVE**

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
