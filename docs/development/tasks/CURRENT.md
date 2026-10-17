# Current Task

**Task:** VG-013 — CLIP STUDIO PAINT Provider & Live Qualification
**Status:** ACTIVE

## Goal

Add a VGate-owned CLIP STUDIO PAINT provider that controls the real Windows application through bounded, guarded OS automation without hard-coding Clip Studio behavior into the VGate gateway core.

## Baseline

- VGate live baseline before work: v0.1.3 / profile `game-dev`
- Existing providers before work: Roblox, Blender, Unity, Godot, MonoGame — all ready
- CLIP STUDIO PAINT live executable:
  `C:\DATAstore\CELSYS\CLIP STUDIO 1.5\CLIP STUDIO PAINT\CLIPStudioPaint.exe`
- Verified product version: 4.0.10
- Existing v0.1.0-v0.1.3 tags/releases are immutable.

## Acceptance evidence

- dedicated `clipstudio` stdio provider discovered by VGate;
- existing five providers remain ready;
- live CLIP STUDIO status/version/process/window call passes;
- launch/focus/open primitives are guarded;
- save/undo/redo use guarded keyboard chords;
- mouse input is rejected outside the Clip Studio main-window rectangle;
- screenshot is file-backed by default with inline image payload opt-in;
- Clip Studio status supports digest/TTL conditional reads without retaining result content;
- local typecheck/tests/build/npm audit pass;
- live VGate refresh exposes Clip Studio without regressing existing providers;
- real CLIP STUDIO 4.0.10 qualification evidence is recorded.

Task file: `docs/development/tasks/VG-013-clip-studio-provider.md`
