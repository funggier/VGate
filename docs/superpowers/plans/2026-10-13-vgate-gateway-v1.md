# VGate Gateway v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the LConnect-derived VGate runtime with an independent multi-provider MCP Gateway while preserving the current ChatGPT tunnel identity.

**Architecture:** VGate is an upstream MCP server and downstream multi-client host. It dynamically discovers downstream capabilities, namespaces and policy-filters them, then proxies them through stdio or Streamable HTTP with provider-level fault isolation.

**Tech Stack:** Node.js >=20, TypeScript, MCP TypeScript SDK v2, Zod v4, Node test runner or Vitest-compatible TypeScript execution.

**Spec:** `docs/architecture/VGATE-GATEWAY-V1-SPEC.md`

## Global Constraints
- Preserve `mcp-conf.yaml`, `tunnel-client.exe`, `local-secrets/`, and required tunnel identity.
- Never commit credentials, tunnel profile, runtime state or logs.
- No LConnect core/modules in final tracked source.
- Use TDD for production behavior.
- Current tunnel must launch VGate via stdio after migration.
- GitHub repository is private `funggier/VGate`.

## Review Focus
- malformed provider config fails with an actionable message without leaking environment values;
- duplicate/colliding downstream names cannot overwrite another route;
- one provider connection failure does not suppress healthy providers;
- refresh removes stale routes and introduces newly discovered routes;
- stdout never receives diagnostic logging in stdio mode.

---

### Task 1: Planning baseline and clean-room boundary
**Files:** spec, plan, task ledger, .gitignore, LICENSE.
**Produces:** independent Git baseline and exact local-only assets to preserve.
- [ ] Initialize Git and planning baseline.
- [ ] Create private GitHub repository and remote.
- [ ] Record preserved local connection assets.
- [ ] Commit.

### Task 2: Core config, namespace and policy
**Files:** `src/config.ts`, `src/namespace.ts`, `src/policy.ts`, corresponding tests.
**Produces:** validated `GatewayConfig`, deterministic upstream names, policy filter.
- [ ] Write failing config/namespace/policy tests.
- [ ] Verify RED.
- [ ] Implement minimal core.
- [ ] Verify GREEN and full suite.
- [ ] Commit.

### Task 3: Downstream provider manager
**Files:** `src/providers/*`, fixture servers, integration tests.
**Consumes:** Task 2 config/policy.
**Produces:** stdio + Streamable HTTP connect/discover/call/close and provider snapshots.
- [ ] Write failing stdio discovery/routing and failure-isolation tests.
- [ ] Verify RED.
- [ ] Implement provider clients and registry.
- [ ] Add HTTP integration test RED then GREEN.
- [ ] Run full suite.
- [ ] Commit.

### Task 4: Upstream federation
**Files:** `src/gateway.ts`, `src/server-stdio.ts`, `src/server-http.ts`, E2E tests.
**Consumes:** Task 3 manager.
**Produces:** dynamically reconciled tools, control tools, prompt/static-resource federation, refresh.
- [ ] Write upstream stdio E2E RED.
- [ ] Implement tool export using downstream JSON Schema through `fromJsonSchema`.
- [ ] Add refresh reconciliation RED/GREEN.
- [ ] Add prompt/static resource federation RED/GREEN where representable.
- [ ] Add Streamable HTTP upstream RED/GREEN.
- [ ] Run full suite.
- [ ] Commit.

### Task 5: Clean local runtime + current tunnel migration
**Files:** VGate launch scripts, `mcp-conf.yaml` local update, local runtime config.
**Consumes:** Task 4 stdio entrypoint.
**Produces:** clean folder and deterministic start/stop/status/restart.
- [ ] Preserve required tunnel assets and remove LConnect-derived application files.
- [ ] Install production dependencies from clean package manifest.
- [ ] Update local tunnel command to VGate stdio entrypoint.
- [ ] Start local tunnel, inspect health and VGate runtime.
- [ ] Perform self-restart and re-inspect through plugin.
- [ ] Commit only tracked source/config examples, never local tunnel state.

### Task 6: Delivery qualification
**Files:** CI workflow, README, qualification report.
**Produces:** exact-commit GitHub/CI/runtime evidence.
- [ ] Run typecheck, tests and package checks fresh.
- [ ] Push exact commit.
- [ ] Verify GitHub remote SHA and Actions run.
- [ ] Verify connected VGate plugin runtime after restart.
- [ ] Close task ledger with evidence.
