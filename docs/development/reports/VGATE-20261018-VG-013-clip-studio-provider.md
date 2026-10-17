# VG-013 — CLIP STUDIO PAINT Provider & Live Qualification

Date: 2026-10-18  
Result: **PASS / DEPLOYED / LIVE GREEN**

## Scope

VG-013 adds CLIP STUDIO PAINT as an independent VGate-owned MCP provider while preserving the generic VGate gateway architecture and the existing conditional-read cache behavior.

No existing tag/release was moved or modified. VGate remains version 0.1.3; this task did not publish a new release.

## Authoritative baseline

Pre-task local/main HEAD:

`840e6c615d6918a55c9a6f7e0edc3a5455599471`

Implementation commit:

`4dd3822cd972ec4ae5e74d295674de523175ea03`

Pre-task production profile:

`game-dev`

Pre-task providers:

- roblox — ready / 30 tools
- blender — ready / 26 tools
- unity — ready / 48 tools
- godot — ready / 36 tools
- monogame — ready / 7 tools

## Real CLIP STUDIO target

Machine-local executable:

`C:\DATAstore\CELSYS\CLIP STUDIO 1.5\CLIP STUDIO PAINT\CLIPStudioPaint.exe`

Verified executable metadata:

- ProductName: `CLIP STUDIO PAINT`
- ProductVersion: `4.0.10`
- observed qualification PID: `27660`
- observed qualification HWND: `0x31A72`
- window state during final qualification: maximized
- observed window rectangle: 2576 x 1426

The executable path is machine-local configuration and remains in ignored `vgate.local.json`, not tracked configuration.

## Architecture

The provider remains outside VGate gateway core:

```text
ChatGPT / MCP host
        |
      VGate
        |
  clipstudio (stdio)
        |
ClipStudioService
        |
PowerShell Win32 helper
        |
CLIP STUDIO PAINT 4.0.10
```

Tracked components:

- `src/providers/clipstudio/server.ts`
- `src/providers/clipstudio/service.ts`
- `src/providers/clipstudio/helper.ts`
- `scripts/clipstudio-win.ps1`
- `tests/clipstudio-provider.test.ts`
- `tests/clipstudio-service.test.ts`

## Tool surface

The provider exposes 12 MCP tools:

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

## Input safety

The Windows helper uses a guarded Win32 path based on the same operating model proven in LConnect:

- exact CLIP STUDIO process/main-window discovery;
- PID/HWND identity verification;
- guarded foreground acquisition before keyboard/mouse mutation;
- `SendInput` for keyboard and mouse injection;
- allowlisted virtual keys;
- key-up events emitted in reverse order for chords;
- mouse coordinates must be within the current CLIP STUDIO main-window rectangle;
- the root window at the point must match the target CLIP STUDIO HWND;
- screenshot capture does not steal focus;
- screenshot output is file-backed by default; inline base64 is explicit and bounded.

During qualification an initial PowerShell 5.1 JSON-array binding issue collapsed `["CTRL","W"]` into `"CTRL W"`. The final implementation removed the nested-array parse path. The provider then emitted four guarded SendInput events and CLIP STUDIO visibly closed the test document.

## Conditional cache

### Provider status cache

`application_status` uses the existing VGate `createConditionalReadCache` implementation with digest-only metadata.

Observed status digest:

`016e1b0281162b98c2a078b5c3362623ed4b830dd284e6966048e6c539217384`

Positive TTL repeat:

- `not_modified=true`
- `result_suppressed=true`
- `cache_hit=true`
- `execution_skipped=true`
- `returned_chars=0`
- `content_retained=false`

TTL=0 revalidation:

- `not_modified=true`
- `cache_hit=false`
- `execution_skipped=false`
- `returned_chars=0`
- `content_retained=false`

Mutation tools are not cached.

### VGate gateway cache after deployment

Post-restart gateway status digest:

`ec4002bf87b98641da2cceefb1ca9034e9d43e9870372c0d609e6799b8f4494d`

Positive TTL repeat observed:

- `cache_hit=true`
- `execution_skipped=true`
- `returned_chars=0`
- `content_retained=false`

TTL=0 observed:

- `cache_hit=false`
- `execution_skipped=false`
- `not_modified=true`
- `returned_chars=0`
- `content_retained=false`

Therefore adding CLIP STUDIO did not regress the VGate-owned control-read cache.

## Real application qualification

A generated 320 x 240 PNG containing a black border and the text `VGate Clip Studio VG-013` was opened through the compiled MCP provider.

Observed results:

- `application_status`: PASS, real ProductVersion 4.0.10
- `open_file`: PASS
- `capture_window`: PASS, 2576 x 1426 visible CLIP STUDIO window
- visual inspection: PASS; test image visible in canvas, Navigator and Layer palette
- `key_press ESC`: PASS, 2 SendInput events
- `shortcut CTRL+W`: PASS, 4 SendInput events
- visual inspection after CTRL+W: PASS; test document closed and blank CLIP STUDIO workspace restored
- out-of-window mouse click at (0,0): correctly rejected
- unsupported key `NOT_A_KEY`: correctly rejected

Temporary qualification images/scripts were removed from `runtime` after evidence collection.

## Automated qualification

Final source qualification:

- `npm run typecheck`: PASS
- `npm test`: PASS — 14 test files / 41 tests
- `npm run build`: PASS
- `npm audit --omit=dev`: PASS — 0 vulnerabilities

## Production deployment

VGate was restarted through the existing detached restart workflow.

Final live provider inventory:

- roblox — ready / 30 tools
- blender — ready / 26 tools
- unity — ready / 48 tools
- godot — ready / 36 tools
- monogame — ready / 7 tools
- clipstudio — ready / 12 tools

Final tunnel health:

- process: running
- liveness: 200 live
- readiness: 200 ready
- control-plane health: PASS

## Client catalog behavior

The ChatGPT session used to perform VG-013 loaded its VGate tool catalog before the `clipstudio` provider existed. After VGate restart, live `vgate_status` and `vgate_list_providers` correctly report `clipstudio` ready with 12 tools, but this already-open session still exposes the old static client-side tool catalog.

This is not a VGate runtime failure. Refresh/reconnect VGate in ChatGPT (or start a session with the refreshed plugin catalog) to make the new `clipstudio__*` names callable through the ChatGPT tool surface.

## Closure

VG-013 acceptance criteria are satisfied.

The real local CLIP STUDIO PAINT 4.0.10 instance is now integrated into the deployed VGate runtime through a bounded, guarded MCP provider, and the existing cache design remains intact.
