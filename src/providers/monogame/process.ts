import { spawn, type ChildProcess } from "node:child_process";
import type { ProcessResult, ProcessSpec } from "./types.js";

function appendBounded(current: Buffer<ArrayBufferLike>, chunk: Buffer<ArrayBufferLike>, maxBytes: number): { buffer: Buffer<ArrayBufferLike>; truncated: boolean } {
  if (current.length >= maxBytes) return { buffer: current, truncated: true };
  const remaining = maxBytes - current.length;
  if (chunk.length <= remaining) return { buffer: Buffer.concat([current, chunk]), truncated: false };
  return { buffer: Buffer.concat([current, chunk.subarray(0, remaining)]), truncated: true };
}

async function terminateTree(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    await new Promise<void>((resolveDone) => {
      const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
        shell: false
      });
      killer.once("error", () => { try { child.kill(); } catch {} resolveDone(); });
      killer.once("exit", () => resolveDone());
    });
    return;
  }
  try { child.kill("SIGKILL"); } catch {}
}

export async function runBoundedProcess(spec: ProcessSpec): Promise<ProcessResult> {
  if (!Number.isInteger(spec.timeoutMs) || spec.timeoutMs <= 0) throw new Error("timeoutMs must be positive.");
  if (!Number.isInteger(spec.maxOutputBytes) || spec.maxOutputBytes <= 0) throw new Error("maxOutputBytes must be positive.");

  return await new Promise<ProcessResult>((resolveDone, reject) => {
    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: spec.env ?? process.env,
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let timedOut = false;
    let settled = false;

    child.stdout.on("data", (chunk: Buffer) => {
      const next = appendBounded(stdout, Buffer.from(chunk), spec.maxOutputBytes);
      stdout = next.buffer;
      stdoutTruncated ||= next.truncated;
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const next = appendBounded(stderr, Buffer.from(chunk), spec.maxOutputBytes);
      stderr = next.buffer;
      stderrTruncated ||= next.truncated;
    });

    const timer = setTimeout(() => {
      timedOut = true;
      void terminateTree(child);
    }, spec.timeoutMs);

    child.once("error", (error) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(error);
    });

    child.once("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      resolveDone({
        exitCode: code,
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
        stdoutTruncated,
        stderrTruncated,
        timedOut
      });
    });
  });
}