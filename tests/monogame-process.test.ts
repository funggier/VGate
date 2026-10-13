import { describe, expect, test } from "vitest";
import { runBoundedProcess } from "../src/providers/monogame/process.js";

describe("MonoGame bounded subprocess runner", () => {
  test("preserves arguments without shell interpretation", async () => {
    const result = await runBoundedProcess({
      command: process.execPath,
      args: ["-e", "console.log(JSON.stringify(process.argv.slice(1)))", "hello world", "a&echo INJECTED"],
      cwd: process.cwd(),
      timeoutMs: 5000,
      maxOutputBytes: 4096
    });
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(JSON.parse(result.stdout.trim())).toEqual(["hello world", "a&echo INJECTED"]);
    expect(result.stdout).not.toMatch(/\nINJECTED\s*$/);
  });

  test("bounds stdout bytes", async () => {
    const result = await runBoundedProcess({
      command: process.execPath,
      args: ["-e", "process.stdout.write('x'.repeat(10000))"],
      cwd: process.cwd(),
      timeoutMs: 5000,
      maxOutputBytes: 128
    });
    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(128);
    expect(result.stdoutTruncated).toBe(true);
  });

  test("times out and terminates a long-running child", async () => {
    const started = Date.now();
    const result = await runBoundedProcess({
      command: process.execPath,
      args: ["-e", "setInterval(()=>{}, 1000)"],
      cwd: process.cwd(),
      timeoutMs: 250,
      maxOutputBytes: 1024
    });
    expect(result.timedOut).toBe(true);
    expect(Date.now() - started).toBeLessThan(4000);
  });
});