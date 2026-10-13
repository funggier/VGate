import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

function canonicalize(path: string): string {
  const absolute = resolve(path);
  if (existsSync(absolute)) return realpathSync.native(absolute);

  const missing: string[] = [];
  let cursor = absolute;
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) break;
    missing.unshift(cursor.slice(parent.length + (parent.endsWith(sep) ? 0 : 1)));
    cursor = parent;
  }
  const base = existsSync(cursor) ? realpathSync.native(cursor) : cursor;
  return resolve(base, ...missing);
}

export function resolveAllowedPath(allowedRoot: string, requestedPath: string): string {
  const root = canonicalize(allowedRoot);
  const candidate = canonicalize(isAbsolute(requestedPath) ? requestedPath : resolve(root, requestedPath));
  const rel = relative(root, candidate);
  if (rel === "") return candidate;
  if (rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel)) {
    throw new Error("Requested path is outside allowed root.");
  }
  return candidate;
}