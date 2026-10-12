import type { ToolPolicy } from "./config.js";

function globToRegex(glob: string): RegExp {
  let pattern = "^";
  for (const char of glob) {
    if (char === "*") pattern += ".*";
    else if (char === "?") pattern += ".";
    else pattern += char.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
  }
  return new RegExp(pattern + "$");
}

function matches(name: string, patterns: string[] | undefined): boolean {
  return !!patterns?.some((pattern) => globToRegex(pattern).test(name));
}

export function toolAllowed(name: string, policy: ToolPolicy): boolean {
  if (matches(name, policy.deny)) return false;
  if (policy.allow && policy.allow.length > 0) return matches(name, policy.allow);
  return policy.default === "allow";
}
