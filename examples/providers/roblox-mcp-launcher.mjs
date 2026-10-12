import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";

async function findStudioMcp() {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) throw new Error("LOCALAPPDATA is not set.");
  const versionsRoot = join(localAppData, "Roblox", "Versions");
  const names = await readdir(versionsRoot, { withFileTypes: true });
  const candidates = [];
  for (const entry of names) {
    if (!entry.isDirectory()) continue;
    const exe = join(versionsRoot, entry.name, "StudioMCP.exe");
    try {
      const info = await stat(exe);
      if (info.isFile()) candidates.push({ exe, mtimeMs: info.mtimeMs });
    } catch {}
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (candidates.length === 0) {
    throw new Error("StudioMCP.exe was not found under %LOCALAPPDATA%\\Roblox\\Versions.");
  }
  return candidates[0].exe;
}

const exe = await findStudioMcp();
const child = spawn(exe, process.argv.slice(2), {
  stdio: "inherit",
  env: process.env,
  windowsHide: true
});
child.once("error", (error) => {
  process.stderr.write("VGate Roblox launcher failed: " + error.message + "\n");
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  if (signal) {
    process.stderr.write("StudioMCP exited by signal " + signal + "\n");
    process.exitCode = 1;
  } else {
    process.exitCode = code ?? 0;
  }
});
