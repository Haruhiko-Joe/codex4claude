import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ensureDir, stateDir } from "./paths.mjs";

const MAX_RUNS = 100;

function stateFile(cwd) {
  return path.join(stateDir(cwd), "state.json");
}

export function readState(cwd) {
  const file = stateFile(cwd);
  if (!existsSync(file)) return { version: 1, agents: {}, runs: [] };
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return { version: 1, agents: {}, runs: [] };
  }
}

export function updateState(cwd, mutate) {
  ensureDir(stateDir(cwd));
  const state = readState(cwd);
  mutate(state);
  state.runs = state.runs.slice(0, MAX_RUNS);
  const file = stateFile(cwd);
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, file);
  return state;
}

export function recordRunStart(cwd, entry) {
  updateState(cwd, (s) => {
    s.runs = [entry, ...s.runs.filter((r) => r.id !== entry.id)];
  });
}

export function recordRunEnd(cwd, runId, patch, agentUpdate) {
  updateState(cwd, (s) => {
    const run = s.runs.find((r) => r.id === runId);
    if (run) Object.assign(run, patch);
    if (agentUpdate) {
      s.agents[agentUpdate.agent] = {
        last_session: agentUpdate.sessionId,
        last_run: runId,
        updated_at: new Date().toISOString(),
      };
    }
  });
}
