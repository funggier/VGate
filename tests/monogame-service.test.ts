import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { MonoGameService } from "../src/providers/monogame/service.js";
import type { ProcessResult, ProcessSpec } from "../src/providers/monogame/types.js";

const ok = (stdout = ""): ProcessResult => ({
  exitCode: 0, stdout, stderr: "", stdoutTruncated: false, stderrTruncated: false, timedOut: false
});

describe("MonoGameService", () => {
  test("reports exact dotnet and MonoGame template discovery", async () => {
    const root = await mkdtemp(join(tmpdir(), "vgate-mg-service-"));
    const calls: ProcessSpec[] = [];
    const service = new MonoGameService({
      allowedRoot: root,
      dotnetPath: "dotnet",
      runProcess: async (spec) => {
        calls.push(spec);
        if (spec.args[0] === "--version") return ok("10.0.401\n");
        if (spec.args[0] === "new") return ok("MonoGame Cross-Platform Desktop Application  mgdesktopgl\n3.8.6");
        return ok("");
      }
    });
    try {
      const status = await service.environmentStatus();
      expect(status.dotnetVersion).toBe("10.0.401");
      expect(status.monoGameTemplatesDetected).toBe(true);
      expect(calls.every((call) => call.command === "dotnet")).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("inspects a MonoGame project and modern Content Builder without mgcb", async () => {
    const root = await mkdtemp(join(tmpdir(), "vgate-mg-modern-"));
    const game = join(root, "Game");
    const content = join(game, "Game.Content");
    await mkdir(join(content, "Assets"), { recursive: true });
    await writeFile(join(game, "Game.csproj"), '<Project><PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup><ItemGroup><PackageReference Include="MonoGame.Framework.DesktopGL" Version="3.8.6" /></ItemGroup><Import Project="Game.Content\\BuildContent.targets" /></Project>');
    await writeFile(join(content, "Game.Content.csproj"), '<Project Sdk="Microsoft.NET.Sdk"><ItemGroup><PackageReference Include="MonoGame.Framework.Content.Pipeline" Version="3.8.6" /></ItemGroup></Project>');
    await writeFile(join(content, "BuildContent.targets"), "<Project />");

    const service = new MonoGameService({ allowedRoot: root, runProcess: async () => ok() });
    try {
      const project = await service.inspectProject(game);
      expect(project.projects.some((p) => p.targetFrameworks.includes("net10.0"))).toBe(true);
      expect(project.projects.some((p) => p.packageReferences.some((pkg) => pkg.id === "MonoGame.Framework.DesktopGL" && pkg.version === "3.8.6"))).toBe(true);

      const found = await service.inspectContent(game);
      expect(found.mode).toBe("content-builder");
      expect(found.contentProjects).toHaveLength(1);
      expect(found.mgcbFiles).toHaveLength(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("detects legacy MGCB and rejects missing/outside projects", async () => {
    const root = await mkdtemp(join(tmpdir(), "vgate-mg-legacy-"));
    const game = join(root, "Legacy");
    await mkdir(join(game, "Content"), { recursive: true });
    await writeFile(join(game, "Legacy.csproj"), "<Project />");
    await writeFile(join(game, "Content", "Content.mgcb"), "# legacy");
    const service = new MonoGameService({ allowedRoot: root, runProcess: async () => ok() });
    try {
      expect((await service.inspectContent(game)).mode).toBe("legacy-mgcb");
      await expect(service.inspectProject(join(root, "Missing"))).rejects.toThrow(/project/i);
      await expect(service.inspectProject(join(root, "..", "outside"))).rejects.toThrow(/outside allowed root/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("uses fixed dotnet verbs and argument arrays for controlled actions", async () => {
    const root = await mkdtemp(join(tmpdir(), "vgate-mg-actions-"));
    const game = join(root, "Game");
    await mkdir(game, { recursive: true });
    await writeFile(join(game, "Game.csproj"), "<Project />");
    const calls: ProcessSpec[] = [];
    const service = new MonoGameService({
      allowedRoot: root,
      dotnetPath: "dotnet",
      runProcess: async (spec) => { calls.push(spec); return ok("ok"); }
    });
    try {
      await service.buildProject(game);
      await service.runProject(game);
      await service.createProject({ projectName: "NewGame", template: "mgdesktopgl", outputPath: join(root, "NewGame") });
      expect(calls.map((c) => c.args[0])).toEqual(["build", "run", "new"]);
      expect(calls[2]?.args).toEqual(["new", "mgdesktopgl", "-n", "NewGame", "-o", join(root, "NewGame")]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("prefers DesktopGL as the deterministic primary project in multi-platform roots", async () => {
    const root = await mkdtemp(join(tmpdir(), "vgate-mg-multi-"));
    const game = join(root, "Game");
    await mkdir(join(game, "Game.Android"), { recursive: true });
    await mkdir(join(game, "Game.DesktopGL"), { recursive: true });
    await writeFile(join(game, "Game.Android", "Game.Android.csproj"), '<Project><ItemGroup><PackageReference Include="MonoGame.Framework.Android" Version="3.8.6" /></ItemGroup></Project>');
    await writeFile(join(game, "Game.DesktopGL", "Game.DesktopGL.csproj"), '<Project><ItemGroup><PackageReference Include="MonoGame.Framework.DesktopGL" Version="3.8.6" /></ItemGroup></Project>');
    const calls: ProcessSpec[] = [];
    const service = new MonoGameService({
      allowedRoot: root,
      runProcess: async (spec) => { calls.push(spec); return ok(); }
    });
    try {
      await service.buildProject(game);
      expect(calls[0]?.args[1]).toMatch(/Game\.DesktopGL\.csproj$/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });});