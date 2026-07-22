import { createHash } from "node:crypto";
import { realpathSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function dataDir() {
  // CLAUDE_PLUGIN_DATA is unreliable here: in Bash it may point at whichever
  // plugin's context is active (observed: the official codex plugin's dir).
  const fromEnv = process.env.CODEX4CLAUDE_DATA;
  if (fromEnv && !fromEnv.includes("${")) return fromEnv;
  return path.join(homedir(), ".claude", "codex4claude");
}

export function workspaceSlug(cwd) {
  let real;
  try {
    real = realpathSync(cwd);
  } catch {
    real = path.resolve(cwd);
  }
  const hash = createHash("sha256").update(real).digest("hex").slice(0, 8);
  const base = path.basename(real).replace(/[^A-Za-z0-9._-]/g, "_") || "root";
  return `${base}-${hash}`;
}

export function stateDir(cwd) {
  return path.join(dataDir(), "state", workspaceSlug(cwd));
}

export function runsDir(cwd) {
  return path.join(stateDir(cwd), "runs");
}

export function runDir(cwd, runId) {
  return path.join(runsDir(cwd), runId);
}

export function userAgentsDir() {
  return path.join(dataDir(), "agents");
}

export function projectAgentsDir(cwd) {
  return path.join(cwd, ".claude", "codex-agents");
}

export function builtinAgentsDir() {
  return path.join(PLUGIN_ROOT, "templates", "agents");
}

export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
  return dir;
}
