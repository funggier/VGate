import { readFile, readdir, stat } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { resolveAllowedPath } from "./paths.js";
import { runBoundedProcess } from "./process.js";
import type { ProcessResult, ProcessSpec } from "./types.js";

export interface MonoGameServiceOptions {
  allowedRoot: string;
  dotnetPath?: string;
  runProcess?: (spec: ProcessSpec) => Promise<ProcessResult>;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface EnvironmentStatus {
  dotnetPath: string;
  dotnetVersion: string;
  monoGameTemplatesDetected: boolean;
  templatesOutput: string;
}

export interface ProjectPackageReference { id: string; version?: string; }
export interface ProjectInfo {
  path: string;
  targetFrameworks: string[];
  packageReferences: ProjectPackageReference[];
}
export interface ProjectInspection {
  root: string;
  projects: ProjectInfo[];
}
export interface ContentInspection {
  mode: "content-builder" | "legacy-mgcb" | "none";
  contentProjects: string[];
  mgcbFiles: string[];
}
export interface CreateProjectInput {
  projectName: string;
  template: string;
  outputPath: string;
}

async function walkFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function visit(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "bin" || entry.name === "obj" || entry.name === ".git") continue;
        await visit(full);
      } else if (entry.isFile()) out.push(full);
    }
  }
  await visit(root);
  return out;
}

function parseTargetFrameworks(xml: string): string[] {
  const values: string[] = [];
  for (const tag of ["TargetFramework", "TargetFrameworks"]) {
    const re = new RegExp("<" + tag + ">([^<]+)</" + tag + ">", "gi");
    for (const match of xml.matchAll(re)) {
      for (const value of (match[1] ?? "").split(";")) {
        const trimmed = value.trim();
        if (trimmed && !values.includes(trimmed)) values.push(trimmed);
      }
    }
  }
  return values;
}

function parsePackages(xml: string): ProjectPackageReference[] {
  const refs: ProjectPackageReference[] = [];
  const tagRe = /<PackageReference\b([^>]*?)(?:\/>|>.*?<\/PackageReference>)/gis;
  for (const match of xml.matchAll(tagRe)) {
    const attrs = match[1] ?? "";
    const id = /\bInclude\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    const version = /\bVersion\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    if (id) refs.push({ id, version });
  }
  return refs;
}

export class MonoGameService {
  private readonly allowedRoot: string;
  private readonly dotnetPath: string;
  private readonly runProcess: (spec: ProcessSpec) => Promise<ProcessResult>;
  private readonly timeoutMs: number;
  private readonly maxOutputBytes: number;

  constructor(options: MonoGameServiceOptions) {
    this.allowedRoot = resolveAllowedPath(options.allowedRoot, options.allowedRoot);
    this.dotnetPath = options.dotnetPath ?? "dotnet";
    this.runProcess = options.runProcess ?? runBoundedProcess;
    this.timeoutMs = options.timeoutMs ?? 120000;
    this.maxOutputBytes = options.maxOutputBytes ?? 1024 * 1024;
  }

  private process(args: string[], cwd = this.allowedRoot): Promise<ProcessResult> {
    return this.runProcess({
      command: this.dotnetPath,
      args,
      cwd,
      timeoutMs: this.timeoutMs,
      maxOutputBytes: this.maxOutputBytes
    });
  }

  async environmentStatus(): Promise<EnvironmentStatus> {
    const version = await this.process(["--version"]);
    if (version.exitCode !== 0 || version.timedOut) throw new Error("dotnet --version failed: " + version.stderr);
    const templates = await this.process(["new", "list"]);
    if (templates.exitCode !== 0 || templates.timedOut) throw new Error("dotnet new list failed: " + templates.stderr);
    return {
      dotnetPath: this.dotnetPath,
      dotnetVersion: version.stdout.trim(),
      monoGameTemplatesDetected: /MonoGame|\bmg[a-z0-9]+\b/i.test(templates.stdout),
      templatesOutput: templates.stdout
    };
  }

  async inspectProject(projectPath: string): Promise<ProjectInspection> {
    const root = resolveAllowedPath(this.allowedRoot, projectPath);
    const info = await stat(root).catch(() => null);
    if (!info?.isDirectory()) throw new Error("MonoGame project directory does not exist: " + root);
    const files = await walkFiles(root);
    const projects: ProjectInfo[] = [];
    for (const file of files.filter((value) => extname(value).toLowerCase() === ".csproj")) {
      const xml = await readFile(file, "utf8");
      projects.push({
        path: file,
        targetFrameworks: parseTargetFrameworks(xml),
        packageReferences: parsePackages(xml)
      });
    }
    if (projects.length === 0) throw new Error("No .csproj project files found under MonoGame project: " + root);
    return { root, projects };
  }

  async inspectContent(projectPath: string): Promise<ContentInspection> {
    const project = await this.inspectProject(projectPath);
    const files = await walkFiles(project.root);
    const mgcbFiles = files.filter((value) => extname(value).toLowerCase() === ".mgcb");
    const contentProjects: string[] = [];
    for (const candidate of project.projects) {
      const xml = await readFile(candidate.path, "utf8");
      const hasPipeline = /MonoGame\.Framework\.Content\.Pipeline/i.test(xml);
      const hasTargets = files.some((value) =>
        basename(value).toLowerCase() === "buildcontent.targets" &&
        dirname(value).toLowerCase() === dirname(candidate.path).toLowerCase()
      );
      if (hasPipeline || hasTargets) contentProjects.push(candidate.path);
    }
    return {
      mode: contentProjects.length ? "content-builder" : mgcbFiles.length ? "legacy-mgcb" : "none",
      contentProjects,
      mgcbFiles
    };
  }

  private async primaryProject(projectPath: string): Promise<string> {
    const inspected = await this.inspectProject(projectPath);
    const runnable = inspected.projects.filter((p) => !p.packageReferences.some((pkg) => pkg.id === "MonoGame.Framework.Content.Pipeline"));
    const desktopGl = runnable.find((p) =>
      /\.DesktopGL\.csproj$/i.test(p.path) ||
      p.packageReferences.some((pkg) => pkg.id === "MonoGame.Framework.DesktopGL")
    );
    return (desktopGl ?? runnable[0] ?? inspected.projects[0])!.path;
  }

  async createProject(input: CreateProjectInput): Promise<ProcessResult> {
    if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(input.projectName)) throw new Error("Invalid MonoGame project name.");
    if (!/^mg[a-z0-9]+$/i.test(input.template)) throw new Error("Invalid MonoGame template name.");
    const output = resolveAllowedPath(this.allowedRoot, input.outputPath);
    return await this.process(["new", input.template, "-n", input.projectName, "-o", output]);
  }

  async buildProject(projectPath: string): Promise<ProcessResult> {
    const project = await this.primaryProject(projectPath);
    return await this.process(["build", project], dirname(project));
  }

  async runProject(projectPath: string): Promise<ProcessResult> {
    const project = await this.primaryProject(projectPath);
    return await this.process(["run", "--project", project], dirname(project));
  }

  async buildContent(projectPath: string): Promise<ProcessResult> {
    const inspected = await this.inspectContent(projectPath);
    if (inspected.mode === "content-builder") {
      const project = await this.primaryProject(projectPath);
      return await this.process(["build", project], dirname(project));
    }
    if (inspected.mode === "legacy-mgcb") {
      const mgcb = inspected.mgcbFiles[0]!;
      return await this.process(["mgcb", mgcb], dirname(mgcb));
    }
    throw new Error("No MonoGame Content Builder or legacy MGCB configuration found.");
  }
}