# VG-009 MonoGame + VS Code Integration Design

Date: 2026-10-13  
Status: DESIGN / PENDING IMPLEMENTATION PLAN

## 1. Goal

Add MonoGame development capability to VGate without coupling MonoGame-specific logic into the VGate gateway core, while making the same qualification project pleasant to use directly in Visual Studio Code.

The integration must preserve the existing VGate v0.1.1 production baseline and must not modify Blender scene content or move/rewrite the v0.1.1 release/tag.

## 2. Authoritative baseline

Fresh session-start evidence:

- repository: `funggier/VGate`
- local root: `T:\Sanbox\openclawspace\VGate-mcp`
- branch: `main`
- HEAD / origin/main: `db5bde48e7a7cce7217f0caeb2264d545818088d`
- worktree: clean
- exact HEAD CI: GitHub Actions CI #11 / run `38394079507` / SUCCESS
- VGate runtime: 0.1.1 / profile `game-dev`
- Roblox: ready / 30 tools
- Blender: ready / 26 tools
- Unity: ready / 48 tools / 18 resources / 6 resource templates
- Godot: ready / 36 tools / 2 prompts / 4 resources
- .NET default SDK: 10.0.401
- installed SDKs: 8.0.417, 9.0.200, 9.0.318, 10.0.401
- MonoGame templates: none installed at design time
- global .NET tools: none installed at design time
- VS Code: 1.141.0
- VS Code C# Dev Kit: 3.40.210
- VS Code C# extension: 2.160.4
- MonoGame for VS Code extension: not installed at design time

## 3. Discovery conclusion

### 3.1 Upstream `jchambless/monogame-mcp`

Do not use it as the production provider.

Reasons verified during discovery:

- repository/package metadata claims a 0.1.0 MCP server and README describes seven tools
- current `main/src/server.ts` returns empty tools/resources/prompts lists
- README recommends an older .NET 8 / legacy MGCB-oriented setup
- npm registry lookup for `monogame-mcp@0.1.0` returned E404
- package metadata says MIT, but no LICENSE/LICENSE.md file was found in the repository during qualification

This candidate is useful as prior-art only.

### 3.2 Other candidates

- MiniMCP has an interesting embedded runtime-inspection concept for .NET/MonoGame, but its MonoGame embedded form is not yet the right project/build/content provider for VG-009.
- GameCodex is primarily documentation/scaffolding knowledge and its GitHub repository is archived; it is not a physical MonoGame build/runtime bridge.

### 3.3 Selected route

Build a small dedicated MonoGame MCP provider under VGate ownership/qualification, connected to VGate through the same normal provider contract as Roblox, Blender, Unity and Godot.

VGate core remains generic.

## 4. MonoGame baseline

Qualification target:

- MonoGame templates/package line: 3.8.6
- primary SDK: .NET 10.0.401
- target host: Windows 10 x64
- initial game target: DesktopGL unless qualification discovers a reason to choose another template
- qualification workspace: `N:\WorkSpace\MonoGameProject\VGateMonoGameQualification`

The provider must understand both:

1. modern MonoGame 3.8.6 Content Builder project workflow, and
2. legacy MGCB projects where present.

It must not assume that every project uses a `.mgcb` file.

## 5. Architecture

```text
ChatGPT
   |
   v
VGate 0.1.x
   |
   +-- roblox provider
   +-- blender provider
   +-- unity provider
   +-- godot provider
   +-- monogame provider  <---- new
              |
              +-- dotnet SDK / MonoGame templates
              +-- MonoGame project inspection
              +-- build / run
              +-- content build / inspection
              +-- bounded project scaffolding

VS Code
   |
   +-- same MonoGame qualification project
   +-- C# Dev Kit / C# extension
   +-- optional MonoGame for VS Code extension
   +-- .vscode/tasks.json
   +-- .vscode/launch.json
   +-- .vscode/extensions.json
```

VS Code and VGate are peers over the same project/toolchain. VS Code is not a VGate provider and VGate must not depend on VS Code being installed.

## 6. MonoGame provider scope

Initial tool surface should stay narrow and deterministic.

Recommended capabilities:

### Read-only / discovery

- `environment_status`
  - exact dotnet executable and SDK
  - detected MonoGame template/tool versions
  - project root validation
- `project_inspect`
  - solution/project files
  - target frameworks
  - MonoGame package references
  - content project style
- `content_inspect`
  - detect Content Builder project or legacy MGCB configuration
  - list declared content inputs without modifying them

### Controlled actions

- `project_create`
  - create a project only beneath an explicitly allowed root
  - explicit template/version
- `project_build`
  - bounded `dotnet build`
- `project_run`
  - bounded `dotnet run` for the selected project
- `content_build`
  - use the project-supported modern Content Builder or legacy MGCB route
- optional `tool_restore`
  - only against the selected project/tool manifest

The first version must not expose a general arbitrary-shell or arbitrary-PowerShell tool.

## 7. Security and containment

The provider must:

- resolve/canonicalize all paths
- restrict write/build/run operations to configured allowed project roots
- reject path traversal and paths outside the qualification/project root
- pass subprocess arguments as argument arrays rather than shell-concatenated commands
- avoid command-shell execution unless a narrow documented compatibility case proves necessary
- bound subprocess timeouts and output size
- return structured exit code/stdout/stderr summaries
- never read or emit VGate tunnel credentials/local secrets
- not modify machine-wide SDK selection
- prefer project-local tool manifests where MonoGame supports them
- pin external versions where practical

## 8. VS Code integration

VS Code is a first-class development/qualification surface, not the source of truth.

### 8.1 Extensions

Required/recommended workspace recommendations:

- `ms-dotnettools.csharp`
- `ms-dotnettools.csdevkit`
- `r88.monogame` as an optional MonoGame productivity extension

Installing `r88.monogame` is allowed only after its current marketplace identity/version is recorded. The build and qualification path must still work without that extension.

### 8.2 Workspace files

The qualification project should contain a small tracked `.vscode/` setup:

- `extensions.json`
  - recommends C#, C# Dev Kit and MonoGame for VS Code
- `tasks.json`
  - Restore
  - Build
  - Run
  - Content Build
  - Provider/VGate smoke where useful
- `launch.json`
  - deterministic F5/debug configuration for the qualification game

Do not put machine-local absolute VGate paths or credentials into these files.

### 8.3 Parity requirement

For each important operation, VS Code must invoke the same underlying CLI/toolchain contract that the provider qualifies.

Examples:

- VS Code Build <-> provider `project_build`
- VS Code Run/F5 <-> provider `project_run`
- VS Code Content Build <-> provider `content_build`

This avoids a false GREEN where the IDE works but the MCP path does not, or vice versa.

## 9. Qualification sequence

### Gate A - Toolchain

1. Record current dotnet/templates/tools state.
2. Install exact MonoGame templates/tooling version selected from current official docs.
3. Prefer project-local tool manifest for project tools.
4. Verify exact before/after delta.

### Gate B - Project

1. Create `N:\WorkSpace\MonoGameProject\VGateMonoGameQualification`.
2. Restore tools/packages.
3. Build successfully.
4. Run a real game window/game loop.
5. Add and load at least one deterministic content asset.
6. Verify content build.

### Gate C - VS Code

1. Open the qualification workspace.
2. C# language service loads.
3. task: build PASS.
4. task: content build PASS.
5. F5/debug launches the game.
6. no task requires VGate-specific hidden machine state.

### Gate D - Isolated provider

1. Run the MonoGame MCP provider standalone/isolated.
2. MCP initialize PASS.
3. tools/list matches expected surface.
4. safe read-only call PASS.
5. project-aware build/content call PASS.
6. absent/invalid project behavior returns controlled failure.

### Gate E - VGate isolated profile

1. temporary profile with only MonoGame provider
2. discovery PASS
3. exact capability counts recorded
4. no namespace collisions
5. timeout/failure isolation PASS

### Gate F - Production integration

Only after A-E are GREEN:

- add tracked example provider/profile configuration
- keep machine paths in ignored local config
- run VGate typecheck/tests/build/audit/diff-check
- exact implementation commit CI must pass
- deploy using existing VGate restart flow
- re-check all existing providers plus MonoGame

## 10. Existing-provider regression contract

Production closure cannot be GREEN unless these remain at least:

- Roblox: ready / 30 tools
- Blender: ready / 26 tools
- Unity: ready / 48 tools / 18 resources / 6 resource templates
- Godot: ready / 36 tools / 2 prompts / 4 resources
- MonoGame: ready / exact qualified counts

No Blender scene content is part of VG-009.

## 11. Repository boundaries

VGate repository may contain:

- provider implementation/adaptor required to launch/use MonoGame tooling
- tests
- tracked example provider configuration
- architecture/task/qualification docs

Qualification game project stays outside VGate:

`N:\WorkSpace\MonoGameProject\VGateMonoGameQualification`

Machine-local config stays ignored.

## 12. Version/release boundary

VG-009 does not automatically create v0.1.2.

Immutable baseline:

- do not move/rewrite v0.1.1
- do not move/rewrite v0.1.0
- do not modify published v0.1.1 release assets

A future release is a separate explicit decision after VG-009 physical qualification and closure.

## 13. Task-state transition

After this design is approved:

1. create the detailed VG-009 implementation plan
2. activate VG-009 in task tracking
3. create/update GitHub issue only at task activation
4. implement in gated phases
5. require local tests + exact-commit CI + production/runtime evidence before closure
