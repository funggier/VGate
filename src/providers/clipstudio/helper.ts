import { spawn } from "node:child_process";

export interface HelperInvocation {
  action: string;
  args?: Record<string, string | number | boolean | undefined>;
  timeoutMs?: number;
}

function encodeValue(value: string | number | boolean): string {
  return typeof value === "string" ? value : String(value);
}

export async function runClipStudioHelper(
  powershellPath: string,
  helperPath: string,
  invocation: HelperInvocation
): Promise<Record<string, unknown>> {
  const timeoutMs = invocation.timeoutMs ?? 15000;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 120000) {
    throw new Error("Invalid Clip Studio helper timeout.");
  }

  const args = [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy", "Bypass",
    "-File", helperPath,
    "-Action", invocation.action
  ];

  for (const [name, value] of Object.entries(invocation.args ?? {})) {
    if (value === undefined) continue;
    args.push("-" + name, encodeValue(value));
  }

  return await new Promise<Record<string, unknown>>((resolve, reject) => {
    const child = spawn(powershellPath, args, {
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const append = (current: string, chunk: Buffer): string => {
      if (current.length >= 262144) return current;
      return (current + chunk.toString("utf8")).slice(0, 262144);
    };

    child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (child.pid && process.platform === "win32") {
        const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
          windowsHide: true,
          shell: false,
          stdio: "ignore"
        });
        killer.once("error", () => { try { child.kill(); } catch {} });
      } else {
        try { child.kill("SIGKILL"); } catch {}
      }
      reject(new Error("Clip Studio helper timed out after " + timeoutMs + "ms."));
    }, timeoutMs);

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
      if (code !== 0) {
        reject(new Error("Clip Studio helper failed (" + code + "): " + (stderr.trim() || stdout.trim())));
        return;
      }
      const text = stdout.trim();
      if (!text) {
        reject(new Error("Clip Studio helper returned no JSON payload."));
        return;
      }
      try {
        resolve(JSON.parse(text) as Record<string, unknown>);
      } catch (error) {
        reject(new Error("Clip Studio helper returned invalid JSON: " + (error instanceof Error ? error.message : String(error))));
      }
    });
  });
}
