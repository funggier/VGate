# VG-009 MonoGame Provider Discovery

Date: 2026-10-13
Status: **DISCOVERY COMPLETE / ARCHITECTURE SELECTED / TASK ACTIVE**

## Fresh authoritative VGate baseline

- repository: `funggier/VGate`
- pre-implementation baseline commit: `ce5b3bbf97ea33d92dcc3ac32b875260bd8c8100`
- source handoff baseline main/origin-main before design work: `db5bde48e7a7cce7217f0caeb2264d545818088d`
- source handoff exact CI: CI #11 / run `38394079507` / SUCCESS
- VGate runtime at discovery: 0.1.1 / `game-dev`
- Roblox: ready / 30 tools
- Blender: ready / 26 tools
- Unity: ready / 48 tools / 18 resources / 6 resource templates
- Godot: ready / 36 tools / 2 prompts / 4 resources

## Machine baseline

- .NET default: 10.0.401
- SDKs: 8.0.417, 9.0.200, 9.0.318, 10.0.401
- MonoGame templates before VG-009 install: none
- global .NET tools before VG-009 install: none
- VS Code: 1.141.0
- C# Dev Kit: 3.40.210
- C#: 2.160.4
- MonoGame for VS Code before VG-009 install: absent

## Official MonoGame baseline selected

Current official/public evidence checked on 2026-10-13:

- `MonoGame.Templates.CSharp@3.8.6` is the current stable template package.
- MonoGame 3.8.6 documentation recommends the Content Builder workflow for new content pipelines.
- MonoGame 3.8.6 projects require .NET 9 or later for the documented Content Builder automation path; .NET 10 is recommended.
- qualification SDK is pinned to the already-installed `10.0.401`.

## MCP provider discovery

### Rejected: `jchambless/monogame-mcp`

Do not use this upstream package in VGate production.

Physical/source evidence:

- README/package metadata describe version 0.1.0 and advertise seven MonoGame tools.
- current repository `main/src/server.ts` registers empty `tools`, `resources`, and `prompts` lists.
- npm registry lookup for `monogame-mcp@0.1.0` returned E404 on this machine.
- repository package metadata declares MIT, but discovery did not find LICENSE or LICENSE.md.
- current README setup is oriented around .NET 8 plus legacy global MGCB rather than the selected MonoGame 3.8.6 Content Builder-first baseline.

Conclusion: useful prior art only; not a production dependency.

### Other candidates

- MiniMCP: useful future runtime-introspection concept, but not the project/build/content provider required for VG-009.
- GameCodex: knowledge/scaffolding oriented and archived on GitHub; not a physical MonoGame project/runtime bridge.

## Selected architecture

Build a dedicated VGate-owned MonoGame MCP provider as a stdio downstream provider.

Initial exact tool contract:

1. `environment_status`
2. `project_inspect`
3. `content_inspect`
4. `project_create`
5. `project_build`
6. `project_run`
7. `content_build`

Security boundary:

- fixed allowed project root
- canonical path containment
- no arbitrary shell tool
- subprocess argument arrays with shell disabled
- bounded output and timeout
- modern Content Builder primary, legacy MGCB only when detected

Qualification project:

`N:\WorkSpace\MonoGameProject\VGateMonoGameQualification`

VS Code is a peer qualification/development surface over the same project and CLI contracts; VGate must not require VS Code to run.

## Baseline verification before implementation

Isolated implementation worktree:

`T:\Sanbox\openclawspace\VGate-vg009`

- `npm ci`: PASS
- `npm test`: 20/20 PASS
- npm install audit: 0 vulnerabilities