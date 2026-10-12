const invalidCapabilityChar = /[^A-Za-z0-9_-]/g;

export function normalizeCapabilityName(name: string): string {
  const normalized = name.replace(invalidCapabilityChar, "_").replace(/_+/g, "_");
  if (!normalized) throw new Error("Capability name becomes empty after normalization.");
  return normalized;
}

export function makeUpstreamName(providerId: string, downstreamName: string): string {
  if (providerId === "vgate" || downstreamName.startsWith("vgate_")) {
    throw new Error("The vgate_ prefix is reserved for VGate-owned capabilities.");
  }
  return providerId + "__" + normalizeCapabilityName(downstreamName);
}
