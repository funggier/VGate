# VG-009 MonoGame + VS Code Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated, bounded MonoGame MCP provider to VGate, qualify MonoGame 3.8.6 with .NET 10 and VS Code on a real external project, then add the provider to `game-dev` without regressing existing providers.

**Architecture:** Keep VGate core generic. Implement the MonoGame provider as a stdio MCP server under `src/providers/monogame/` with a narrow project-root sandbox and structured dotnet/MonoGame operations. VS Code and VGate use the same external qualification project/toolchain; production VGate only receives MonoGame after standalone and isolated-profile qualification.

**Tech Stack:** Node.js/TypeScript, MCP SDK v2 packages already in VGate, Vitest, .NET SDK 10.0.401, MonoGame 3.8.6, Visual Studio Code 1.141.0, C# Dev Kit, C# extension, optional MonoGame for VS Code.

**Spec:** `docs/architecture/VG-009-MONOGAME-VSCODE-INTEGRATION-SPEC.md`

## Global Constraints

- Preserve VGate v0.1.1 as immutable; do not move/rewrite tags `v0.1.1` or `v0.1.0`.
- Do not modify Blender scene content.
- Do not reset/clean the VGate worktree and do not force push.
- MonoGame integration belongs in VGate, not LConnect.
- Qualification game project stays outside the VGate repo at `N:\WorkSpace\MonoGameProject\VGateMonoGameQualification`.
- Target MonoGame templates/framework line: exactly `3.8.6`.
- Primary .NET SDK: exactly `10.0.401`; do not remove existing SDKs or change machine-wide SDK selection unnecessarily.
- Modern MonoGame 3.8.6 Content Builder is primary; legacy MGCB is supported only when detected.
- Provider must not expose arbitrary shell/PowerShell execution.
- Provider write/build/run operations must stay beneath configured allowed project roots.
- Machine-local paths remain in ignored local configuration/environment, never tracked example config.
- Existing production provider minimums must remain Roblox 30, Blender 26, Unity 48 + 18 resources + 6 templates, Godot 36 + 2 prompts + 4 resources.
- No automatic v0.1.2 release as part of VG-009.

## Review Focus

- A project path using `..`, a sibling path, or a path prefix that merely starts with the allowed-root text must be rejected after canonical resolution.
- Spawn arguments containing spaces/quotes/metacharacters must remain argument-array values and never be shell-concatenated.
- A MonoGame project with modern Content Builder but no `.mgcb` must inspect/build successfully instead of being misclassified as missing content support.
- Missing dotnet/template/project files must return structured MCP errors without crashing the provider process.
- Long-running build/run output must be bounded and timed out deterministically; a timeout must not leave a child process running indefinitely.

---

### Task 1: Activate VG-009 and freeze discovery evidence

**Files:**
- Modify: `docs/development/tasks/CURRENT.md`
- Modify: `docs/development/tasks/ROADMAP.md`
- Create: `docs/development/reports/VGATE-20261013-VG-009-discovery.md`

**Interfaces:**
- Consumes: design spec and fresh session evidence.
- Produces: active task record, selected architecture, rejected upstream-provider evidence, exact official MonoGame baseline.

- [ ] **Step 1: Write/update task documentation with VG-009 ACTIVE and record discovery evidence.**
- [ ] **Step 2: Verify docs contain MonoGame 3.8.6, .NET 10.0.401, dedicated-provider route, VS Code parity requirement, and explicit upstream `monogame-mcp` rejection.**
- [ ] **Step 3: Run `git diff --check`; Expected: exit 0.**
- [ ] **Step 4: Commit with message `VG-009 activate MonoGame provider integration`.**

### Task 2: MonoGame command boundary and project sandbox

**Files:**
- Create: `src/providers/monogame/types.ts`
- Create: `src/providers/monogame/paths.ts`
- Create: `src/providers/monogame/process.ts`
- Create: `tests/monogame-paths.test.ts`
- Create: `tests/monogame-process.test.ts`

**Interfaces:**
- Produces:
  - `resolveAllowedPath(allowedRoot: string, requestedPath: string): string`
  - `runBoundedProcess(spec: ProcessSpec): Promise<ProcessResult>`
  - `ProcessSpec` with `command`, `args: string[]`, `cwd`, `timeoutMs`, `maxOutputBytes`
  - `ProcessResult` with `exitCode`, bounded `stdout`, `stderr`, `timedOut`

- [ ] **Step 1: Write failing path tests** asserting a child path passes while `..`, sibling paths and textual-prefix escapes fail.
- [ ] **Step 2: Run `npm test -- tests/monogame-paths.test.ts`; Expected: FAIL because module/functions do not exist.**
- [ ] **Step 3: Implement canonical root containment with Windows case-insensitive comparison and separator boundary.**
- [ ] **Step 4: Run path tests; Expected: PASS.**
- [ ] **Step 5: Write failing process tests** asserting args are preserved, output is bounded, timeout terminates the child, and no shell is requested.
- [ ] **Step 6: Run `npm test -- tests/monogame-process.test.ts`; Expected: FAIL because process runner does not exist.**
- [ ] **Step 7: Implement `runBoundedProcess` using `spawn(..., { shell: false })`, output caps and timeout termination.**
- [ ] **Step 8: Run both MonoGame boundary tests and then full `npm test`; Expected: all PASS.**
- [ ] **Step 9: Commit with message `VG-009 add MonoGame process sandbox`.**

### Task 3: MonoGame environment/project/content service

**Files:**
- Create: `src/providers/monogame/service.ts`
- Create: `tests/monogame-service.test.ts`

**Interfaces:**
- Consumes: `resolveAllowedPath`, `runBoundedProcess`.
- Produces `MonoGameService`:
  - `environmentStatus(): Promise<EnvironmentStatus>`
  - `inspectProject(projectPath: string): Promise<ProjectInspection>`
  - `inspectContent(projectPath: string): Promise<ContentInspection>`
  - `createProject(input: CreateProjectInput): Promise<ProcessResult>`
  - `buildProject(projectPath: string): Promise<ProcessResult>`
  - `runProject(projectPath: string): Promise<ProcessResult>`
  - `buildContent(projectPath: string): Promise<ProcessResult>`

- [ ] **Step 1: Write failing service tests** for exact dotnet discovery, project/package inspection, modern Content Builder detection without `.mgcb`, legacy MGCB detection, missing project error, and root escape rejection.
- [ ] **Step 2: Run service tests; Expected: FAIL because service does not exist.**
- [ ] **Step 3: Implement read-only environment/project/content inspection using filesystem parsing plus bounded `dotnet` calls.**
- [ ] **Step 4: Implement controlled create/build/run/content-build operations with fixed command verbs and argument arrays.**
- [ ] **Step 5: Run service tests then full `npm test`; Expected: all PASS.**
- [ ] **Step 6: Commit with message `VG-009 add MonoGame project service`.**

### Task 4: MCP stdio server for MonoGame

**Files:**
- Create: `src/providers/monogame/server.ts`
- Create: `tests/monogame-provider.test.ts`
- Modify: `package.json` only if a dedicated provider script materially improves local qualification.

**Interfaces:**
- Consumes: `MonoGameService`.
- Produces stdio MCP server named `vgate-monogame` exposing exactly seven initial tools:
  - `environment_status`
  - `project_inspect`
  - `content_inspect`
  - `project_create`
  - `project_build`
  - `project_run`
  - `content_build`

- [ ] **Step 1: Write failing provider integration test** that spawns the built/dev server through MCP client transport and asserts the exact seven tool names.
- [ ] **Step 2: Add failing tests for safe read-only call and structured missing-project error.**
- [ ] **Step 3: Run provider tests; Expected: FAIL because server is absent.**
- [ ] **Step 4: Implement MCP server and Zod input validation, delegating all filesystem/process behavior to `MonoGameService`.**
- [ ] **Step 5: Run provider tests, full `npm test`, `npm run typecheck`, `npm run build`; Expected: all PASS.**
- [ ] **Step 6: Commit with message `VG-009 add dedicated MonoGame MCP provider`.**

### Task 5: Toolchain and external MonoGame qualification project

**Files outside VGate repo:**
- Create: `N:\WorkSpace\MonoGameProject\VGateMonoGameQualification\global.json`
- Create: MonoGame 3.8.6 project files from official template/StartKit-compatible route.
- Create: deterministic content asset and Content Builder wiring required for real content load.

**Interfaces:**
- Consumes: official MonoGame 3.8.6 templates and .NET 10.0.401.
- Produces: real buildable/runnable qualification game with deterministic content.

- [ ] **Step 1: Capture pre-install `dotnet --version`, `--list-sdks`, `dotnet new list`, and global tools.**
- [ ] **Step 2: Install `MonoGame.Templates.CSharp@3.8.6`; do not install legacy global MGCB unless a qualification case explicitly needs it.**
- [ ] **Step 3: Record template delta and exact installed version.**
- [ ] **Step 4: Create qualification project under the fixed external root and pin SDK with `global.json` = 10.0.401.**
- [ ] **Step 5: Add one deterministic asset through the MonoGame 3.8.6 recommended Content Builder path and load it in the game.**
- [ ] **Step 6: Run restore/build/content build; Expected: PASS.**
- [ ] **Step 7: Launch real game loop/window and confirm process remains alive long enough for smoke evidence, then terminate cleanly.**
- [ ] **Step 8: Record exact project/toolchain evidence in the VG-009 report.**

### Task 6: VS Code qualification parity

**Files outside VGate repo:**
- Create: `N:\WorkSpace\MonoGameProject\VGateMonoGameQualification\.vscode\extensions.json`
- Create: `...\.vscode\tasks.json`
- Create: `...\.vscode\launch.json`

**Interfaces:**
- Consumes: same qualification project and CLI commands from Task 5.
- Produces VS Code Restore/Build/Run/Content Build/F5 paths that match provider command contracts.

- [ ] **Step 1: Record current VS Code + C# extension versions.**
- [ ] **Step 2: Verify current marketplace identity/version of `r88.monogame`, install it, and record the installed version.**
- [ ] **Step 3: Write workspace recommendations and CLI-backed tasks without machine-specific VGate paths or credentials.**
- [ ] **Step 4: Add launch configuration for the qualification game using the built executable/project output.**
- [ ] **Step 5: Run the exact task commands independently from terminal; Expected: build/content/run PASS.**
- [ ] **Step 6: Verify VS Code extension list and workspace files; record evidence.**

### Task 7: Isolated provider qualification

**Files:**
- Create: `config/vgate.monogame.probe.example.json` or a temporary ignored local probe config, choosing tracked form only if reusable without machine paths.
- Modify/Create tests if probe configuration needs regression coverage.

**Interfaces:**
- Consumes: built MonoGame provider and qualification project.
- Produces: isolated VGate profile where MonoGame is the only downstream provider.

- [ ] **Step 1: Add a probe config with machine path supplied only through environment/local ignored state.**
- [ ] **Step 2: Run VGate against MonoGame only; Expected: provider `ready`, exactly 7 tools, no prompts/resources unless deliberately added later.**
- [ ] **Step 3: Call `environment_status`, `project_inspect`, `content_inspect`, `project_build`, and `content_build`; Expected: PASS.**
- [ ] **Step 4: Exercise invalid/missing project path; Expected: structured error while provider stays alive.**
- [ ] **Step 5: Commit reusable tracked probe/test changes with message `VG-009 qualify isolated MonoGame provider`.**

### Task 8: Production game-dev configuration integration

**Files:**
- Modify: `config/vgate.example.json`
- Modify: `tests/game-dev-operator.test.ts`
- Modify: relevant README/docs for MonoGame local environment setup.
- Modify ignored local `vgate.local.json` only after tracked tests are green.

**Interfaces:**
- Consumes: exact seven-tool provider from Task 4 and qualification evidence.
- Produces: tracked `game-dev` profile `roblox + blender + unity + godot + monogame`.

- [ ] **Step 1: Change `tests/game-dev-operator.test.ts` first to expect `monogame` and exact provider launch/config contract; run and watch RED.**
- [ ] **Step 2: Add tracked example config using `node dist/providers/monogame/server.js` and an env reference for allowed root; no machine absolute path.**
- [ ] **Step 3: Run changed test then full suite; Expected: GREEN.**
- [ ] **Step 4: Run `npm run typecheck`, `npm test`, `npm run build`, `npm audit --audit-level=high`, `git diff --check`; Expected: all PASS / 0 high-critical.**
- [ ] **Step 5: Commit with message `VG-009 integrate MonoGame into game-dev`.**

### Task 9: Exact-commit CI, deployment, physical regression and closure

**Files:**
- Modify ignored production `vgate.local.json` for local MonoGame allowed root.
- Create/Modify: `docs/development/reports/VGATE-20261013-VG-009-qualification.md`
- Modify: `docs/development/tasks/CURRENT.md`
- Modify: `docs/development/tasks/ROADMAP.md`

**Interfaces:**
- Consumes: exact implementation commit from Task 8.
- Produces: exact-commit CI and production runtime evidence; VG-009 closed only if all gates pass.

- [ ] **Step 1: Push the implementation branch/ref without force and obtain exact commit SHA.**
- [ ] **Step 2: Wait for GitHub CI on that exact SHA; Expected: SUCCESS.**
- [ ] **Step 3: Update ignored production local config and restart VGate through existing detached restart flow.**
- [ ] **Step 4: Verify control plane and provider snapshot: Roblox >=30, Blender >=26, Unity >=48 + 18 resources + 6 templates, Godot >=36 + 2 prompts + 4 resources, MonoGame = exact 7 qualified tools, all `ready`.**
- [ ] **Step 5: Invoke physical MonoGame read-only and project/content/build calls through production VGate; Expected: PASS.**
- [ ] **Step 6: Write qualification report with exact commit, CI run, toolchain/VS Code versions and runtime evidence.**
- [ ] **Step 7: Mark VG-009 DONE / DEPLOYED / LIVE GREEN only if every required physical check passed; otherwise leave ACTIVE with blocker evidence.**
- [ ] **Step 8: Commit docs-only closure. Do not create or move any release tag.**
