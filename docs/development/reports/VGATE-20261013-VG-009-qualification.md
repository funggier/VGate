# VG-009 MonoGame Provider Qualification

Date: 2026-10-13
Status: DONE / DEPLOYED / LIVE GREEN

## Scope

VG-009 adds a VGate-owned MonoGame MCP provider without changing the generic VGate gateway architecture or the existing Roblox, Blender, Unity, and Godot providers.

Initial MonoGame tool surface:

1. environment_status
2. project_inspect
3. content_inspect
4. project_create
5. project_build
6. project_run
7. content_build

The provider is bounded by an allowed project root, canonical path containment, subprocess argument arrays with shell disabled, output limits, and deterministic timeouts. It does not expose arbitrary shell or PowerShell execution.

## Qualified implementation

- Repository: funggier/VGate
- Exact implementation SHA: c099d3a82391562a216416ede6028e1ada9cd6c0
- origin/main: fast-forwarded to the same SHA with no force push
- Existing release tags preserved: v0.1.0, v0.1.1
- VGate package version remains 0.1.1
- No v0.1.2 release was created

## CI evidence

Final implementation CI on dev/vg-009-monogame-vscode:

- GitHub Actions CI #15
- run 38398889060
- exact SHA c099d3a82391562a216416ede6028e1ada9cd6c0
- result: SUCCESS

Main-branch CI after fast-forward:

- GitHub Actions CI #16
- run 38399029024
- exact SHA c099d3a82391562a216416ede6028e1ada9cd6c0
- result: SUCCESS
- npm ci: SUCCESS
- npm run typecheck: SUCCESS
- npm test: SUCCESS
- npm run build: SUCCESS
- npm audit --audit-level=high: SUCCESS

## Local production-checkout verification

Production checkout:

T:\Sanbox\openclawspace\VGate-mcp

Fresh verification on deployed main:

- npm ci: PASS
- TypeScript typecheck: PASS
- test suite: 32/32 PASS
- production build: PASS
- npm audit: 0 vulnerabilities
- cumulative git diff --check: PASS before deployment

## MonoGame toolchain

Qualification baseline:

- .NET SDK: 10.0.401
- MonoGame template package installed: MonoGame.Templates.CSharp@3.8.6
- qualification project root: N:\WorkSpace\MonoGameProject\VGateMonoGameQualification
- production allowed root: N:\WorkSpace\MonoGameProject

The MonoGame 3.8.6 StartKit template generated several package references at 3.8.5. The qualification project was therefore explicitly pinned to MonoGame package version 3.8.6 while retaining the template's net9.0 target frameworks and using SDK 10.0.401 via global.json.

Real qualification results:

- Content Builder detected without requiring a legacy .mgcb file
- DesktopGL selected as deterministic primary runnable/build target
- Content Builder qualification asset generated successfully
- Content Builder: 1 succeeded, 0 failed
- DesktopGL build: 0 Warning(s), 0 Error(s)
- real DesktopGL game loop launched successfully and remained alive for smoke observation before clean termination

## VS Code parity

Verified installed tooling:

- Visual Studio Code: 1.141.0
- C# Dev Kit: 3.40.210
- C#: 2.160.4
- MonoGame for VS Code (r88.monogame): 0.0.7

Qualification workspace contains CLI-backed Restore, Build, Content Build, Run, and F5 configuration using the same project/toolchain contract as the MCP provider.

## Isolated provider qualification

The dedicated MonoGame provider was first qualified in isolation before production integration.

Result:

- provider state: ready
- exact tool count: 7
- environment_status: PASS
- project_inspect: PASS
- content_inspect: PASS
- project_build: PASS
- content_build: PASS
- missing project path: structured error, provider remained ready
- outside allowed root: structured error, provider remained ready

## Production deployment

Production vgate.local.json was merged rather than replaced. Existing machine-local Blender, Unity, Godot, and tunnel settings were preserved.

Post-restart tunnel evidence:

- tunnel process: running
- liveness: 200 live
- readiness: 200 ready
- control-plane health: PASS

Live VGate inventory after restart and vgate_refresh:

- Roblox: ready / 30 tools
- Blender: ready / 26 tools
- Unity: ready / 48 tools / 18 resources / 6 resource templates
- Godot: ready / 36 tools / 2 prompts / 4 resources
- MonoGame: ready / 7 tools / 0 prompts / 0 resources

No existing provider capability baseline regressed.

## Deployed-path physical calls

The ChatGPT tool catalog for the already-open session did not dynamically add newly introduced monogame tool names after the tunnel restart, even though live vgate_status, vgate_list_providers, and vgate_refresh all reported MonoGame ready with seven tools.

To verify the deployed gateway contract without relying on that static client catalog, a fresh MCP client launched the deployed dist/server-stdio.js from the production main checkout with the production MonoGame provider configuration and called the real qualification project.

Result:

- list tools: exactly seven monogame tools
- environment_status: PASS / .NET 10.0.401 / MonoGame templates detected
- project_inspect: PASS / MonoGame package refs 3.8.6 visible
- content_inspect: PASS / mode content-builder / no .mgcb
- project_build: exit 0 / Content Builder 1 succeeded, 0 failed / build 0 warnings, 0 errors
- content_build: exit 0 / Content Builder 1 succeeded, 0 failed / build 0 warnings, 0 errors
- missing project: expected structured error
- outside allowed root: expected structured error
- qualification process exit code: 0

This uses the deployed build and the same stdio gateway contract used by the production tunnel.

## Discovery decision

jchambless/monogame-mcp was not adopted as a dependency. Discovery evidence found that its current repository state did not provide a production-ready tool surface matching the required MonoGame 3.8.6 workflow. VGate therefore owns the bounded provider implementation directly.

See also:

- docs/architecture/VG-009-MONOGAME-VSCODE-INTEGRATION-SPEC.md
- docs/superpowers/plans/2026-10-13-vg-009-monogame-vscode-integration.md
- docs/development/reports/VGATE-20261013-VG-009-discovery.md

## Closure

VG-009 is DONE / DEPLOYED / LIVE GREEN.

No further active VGate task is opened by this closure, and no release/tag operation is part of VG-009.