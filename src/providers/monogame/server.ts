import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { MonoGameService } from "./service.js";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Required environment variable " + name + " is not set.");
  return value;
}

function numericEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(name + " must be a positive integer.");
  return value;
}

function success(payload: unknown) {
  const text = JSON.stringify(payload, null, 2);
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: payload as Record<string, unknown>
  };
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }]
  };
}

function createMonoGameServer(): McpServer {
  const service = new MonoGameService({
    allowedRoot: requiredEnv("MONOGAME_MCP_ALLOWED_ROOT"),
    dotnetPath: process.env.MONOGAME_MCP_DOTNET || "dotnet",
    timeoutMs: numericEnv("MONOGAME_MCP_TIMEOUT_MS", 120000),
    maxOutputBytes: numericEnv("MONOGAME_MCP_MAX_OUTPUT_BYTES", 1024 * 1024)
  });

  const server = new McpServer({ name: "vgate-monogame", version: "0.1.0" });

  server.registerTool("environment_status", {
    description: "Report the configured .NET SDK and detected MonoGame templates.",
    inputSchema: z.object({})
  }, async () => {
    try { return success(await service.environmentStatus()); } catch (error) { return failure(error); }
  });

  server.registerTool("project_inspect", {
    description: "Inspect C# projects, target frameworks and package references beneath the allowed MonoGame root.",
    inputSchema: z.object({ projectPath: z.string().min(1) })
  }, async ({ projectPath }) => {
    try { return success(await service.inspectProject(projectPath)); } catch (error) { return failure(error); }
  });

  server.registerTool("content_inspect", {
    description: "Detect MonoGame 3.8.6 Content Builder or legacy MGCB configuration for a project.",
    inputSchema: z.object({ projectPath: z.string().min(1) })
  }, async ({ projectPath }) => {
    try { return success(await service.inspectContent(projectPath)); } catch (error) { return failure(error); }
  });

  server.registerTool("project_create", {
    description: "Create a MonoGame project from an explicit installed template beneath the allowed root.",
    inputSchema: z.object({
      projectName: z.string().min(1),
      template: z.string().min(1),
      outputPath: z.string().min(1)
    })
  }, async (input) => {
    try { return success(await service.createProject(input)); } catch (error) { return failure(error); }
  });

  server.registerTool("project_build", {
    description: "Build the primary MonoGame project beneath the allowed root.",
    inputSchema: z.object({ projectPath: z.string().min(1) })
  }, async ({ projectPath }) => {
    try { return success(await service.buildProject(projectPath)); } catch (error) { return failure(error); }
  });

  server.registerTool("project_run", {
    description: "Run the primary MonoGame project beneath the allowed root with the configured bounded timeout.",
    inputSchema: z.object({ projectPath: z.string().min(1) })
  }, async ({ projectPath }) => {
    try { return success(await service.runProject(projectPath)); } catch (error) { return failure(error); }
  });

  server.registerTool("content_build", {
    description: "Build MonoGame content using the detected 3.8.6 Content Builder path or legacy MGCB fallback.",
    inputSchema: z.object({ projectPath: z.string().min(1) })
  }, async ({ projectPath }) => {
    try { return success(await service.buildContent(projectPath)); } catch (error) { return failure(error); }
  });

  return server;
}

await serveStdio(() => createMonoGameServer());