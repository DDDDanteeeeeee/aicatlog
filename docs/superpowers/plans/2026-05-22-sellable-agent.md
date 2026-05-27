# Sellable Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current control shell into a desktop Agent that can be packaged, unlocked, configured, and run a real local Illustrator translation pipeline.

**Architecture:** Keep the React UI as the desktop renderer, Electron as the local secure bridge, and Node scripts as the local runner. The runner owns Illustrator automation, model translation, payload generation, writeback, and QA report generation.

**Tech Stack:** React, Vite, Electron, electron-builder, Node.js ESM, PowerShell COM automation, Illustrator JSX, OpenAI-compatible chat completions.

---

### Task 1: Product Contract

**Files:**
- Create: `docs/PRODUCT_SPEC.md`
- Create: `docs/superpowers/plans/2026-05-22-sellable-agent.md`

- [x] **Step 1: Capture final product scope**

Write the product scope so implementation stays focused on the Agent itself, not user environment preparation.

- [x] **Step 2: Capture China domestic network constraints**

Record that runtime must not depend on Vercel/Netlify/Google-hosted services and should use configurable OpenAI-compatible endpoints.

### Task 2: Local Runner Core

**Files:**
- Create: `scripts/agent-core.mjs`
- Modify: `scripts/agent-runner.mjs`
- Create: `tests/agent-core.test.mjs`

- [ ] **Step 1: Implement reusable runner helpers**

Create helpers for run directory creation, JSX string escaping, Illustrator JSX generation, translation payload generation, OpenAI-compatible request building, and result reports.

- [ ] **Step 2: Connect runner CLI to core**

Update `agent-runner.mjs` so it reads task payload, runs the core pipeline, and outputs JSON.

- [ ] **Step 3: Add Node tests**

Use `node --test tests/agent-core.test.mjs` to verify payload generation and request shaping without launching Illustrator.

### Task 3: UI to Runner Contract

**Files:**
- Modify: `src/App.tsx`
- Modify: `electron/main.cjs`

- [ ] **Step 1: Send complete task payload**

Ensure UI sends source path, output name, glossary, provider, endpoint, model, and API Key to the local runner.

- [ ] **Step 2: Show real runner errors**

Display runner stderr and report errors in the task log/report panel.

### Task 4: Packaging Readiness

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Keep packaging scripts stable**

Verify `electron:dev`, `build`, and `package:win` command contracts.

- [ ] **Step 2: Verify buildable state**

Run `npm.cmd run build`, `node --check electron/main.cjs`, `node --check electron/preload.cjs`, and `node --test tests/agent-core.test.mjs`.

### Task 5: Completion Gate

**Files:**
- No file changes unless verification exposes a bug.

- [ ] **Step 1: Run fresh verification**

Run all verification commands again and record actual pass/fail output.

- [ ] **Step 2: Report remaining blockers**

If installer packaging fails because Electron runtime download is blocked, report it as an environment/network blocker rather than a code completion claim.
