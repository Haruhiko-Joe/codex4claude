import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { EFFORTS, resolveAgent } from "./agents.mjs";
import { parseArgs, UsageError } from "./args.mjs";
import { MODEL, buildExecArgv, spawnCodex } from "./codex.mjs";
import { createEventCollector } from "./events.mjs";
import { ensureDir, runDir } from "./paths.mjs";
import { readMeta, renderRun } from "./report.mjs";
import { readState, recordRunEnd, recordRunStart } from "./state.mjs";

export const RUN_FLAGS = {
  continue: "boolean",
  session: "string",
  write: "boolean",
  "read-only": "boolean",
  dangerous: "boolean",
  effort: "string",
  fast: "boolean",
  background: "boolean",
  timeout: "string",
  cd: "string",
  ephemeral: "boolean",
  "prompt-file": "string",
};

const DEFAULT_TIMEOUT_SEC = 540;

function newRunId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `r-${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}-${randomBytes(2).toString("hex")}`;
}

function readPrompt(flags, positionals) {
  if (flags["prompt-file"]) return readFileSync(flags["prompt-file"], "utf8");
  if (positionals.length > 1) return positionals.slice(1).join(" ");
  if (process.stdin.isTTY) throw new UsageError("no prompt: pass as argument, --prompt-file, or pipe via stdin");
  const fromStdin = readFileSync(0, "utf8");
  if (!fromStdin.trim()) throw new UsageError("empty prompt");
  return fromStdin;
}

function gitChangedPaths(cwd) {
  const res = spawnSync("git", ["status", "--porcelain"], { cwd, encoding: "utf8" });
  if (res.status !== 0) return null; // not a git repo
  return res.stdout
    .split("\n")
    .filter(Boolean)
    .map((l) => l.slice(3).trim());
}

export function writeMeta(dir, patch) {
  const file = path.join(dir, "meta.json");
  const current = readMeta(dir) ?? {};
  const merged = { ...current, ...patch };
  writeFileSync(file, JSON.stringify(merged, null, 2));
  return merged;
}

function guardConcurrentWrite(cwd, sandbox) {
  if (sandbox === "read-only") return;
  const state = readState(cwd);
  for (const r of state.runs) {
    if (r.status !== "running" || r.sandbox === "read-only" || !r.pid) continue;
    try {
      process.kill(r.pid, 0);
      throw new UsageError(
        `another write run is active in this workspace (${r.id}, agent=${r.agent}); ` +
          `wait, cancel it, or run read-only`
      );
    } catch (err) {
      if (err instanceof UsageError) throw err;
      // pid dead — stale entry, ignore
    }
  }
}

export function prepareRun(argv) {
  const { flags, positionals } = parseArgs(argv, RUN_FLAGS);
  const agentName = positionals[0];
  if (!agentName) throw new UsageError("run <agent> [PROMPT]");
  const cwd = path.resolve(flags.cd ?? process.cwd());
  const agent = resolveAgent(agentName, cwd);
  if (!agent) throw new UsageError(`agent "${agentName}" not found (see: agent list)`);

  let sandbox = agent.sandbox;
  if (flags["read-only"]) sandbox = "read-only";
  if (flags.write) sandbox = "workspace-write";
  if (flags.dangerous) sandbox = "danger-full-access";

  const effort = flags.effort ?? agent.effort;
  if (effort && !EFFORTS.includes(effort)) {
    throw new UsageError(`effort must be one of: ${EFFORTS.join(", ")}`);
  }

  let resumeSessionId = flags.session ?? null;
  if (flags.continue && !resumeSessionId) {
    const last = readState(cwd).agents[agentName]?.last_session;
    if (!last) throw new UsageError(`no previous session for agent "${agentName}" in this workspace`);
    resumeSessionId = last;
  }

  const rawPrompt = readPrompt(flags, positionals).trim();
  const prompt = resumeSessionId
    ? rawPrompt
    : `<system_instructions>\n${agent.instructions}\n</system_instructions>\n\n<task>\n${rawPrompt}\n</task>`;

  return {
    cwd,
    agent: agentName,
    sandbox,
    effort,
    fast: Boolean(flags.fast),
    model: MODEL,
    prompt,
    rawPrompt,
    resumeSessionId,
    ephemeral: Boolean(flags.ephemeral),
    timeoutSec: flags.timeout ? Number(flags.timeout) : DEFAULT_TIMEOUT_SEC,
    background: Boolean(flags.background),
    dangerous: Boolean(flags.dangerous),
  };
}

// Runs one codex turn to completion. Shared by foreground path and background worker.
export async function executeRun(ctx) {
  const { cwd } = ctx;
  const isNewRun = !ctx.runId;
  const runId = ctx.runId ?? newRunId();
  const dir = ensureDir(runDir(cwd, runId));
  const prevMeta = readMeta(dir);
  const turn = (prevMeta?.turns ?? 0) + 1;

  appendFileSync(path.join(dir, "prompt.txt"), `\n==== turn ${turn} ====\n${ctx.prompt}\n`);
  const title = ctx.rawPrompt.split("\n")[0].slice(0, 60);
  const started = Date.now();
  writeMeta(dir, {
    run_id: runId,
    agent: ctx.agent,
    cwd,
    model: ctx.model,
    sandbox: ctx.sandbox,
    effort: ctx.effort ?? null,
    fast: Boolean(ctx.fast),
    status: "running",
    turns: turn,
    session_id: ctx.resumeSessionId ?? prevMeta?.session_id ?? null,
    started_at: prevMeta?.started_at ?? new Date(started).toISOString(),
    title: prevMeta?.title ?? title,
  });
  if (isNewRun) {
    recordRunStart(cwd, {
      id: runId,
      agent: ctx.agent,
      status: "running",
      sandbox: ctx.sandbox,
      pid: process.pid,
      started_at: new Date(started).toISOString(),
      title,
    });
  }

  const gitBefore = ctx.sandbox === "read-only" ? null : gitChangedPaths(cwd);
  const collector = createEventCollector();
  const lastMessageFile = path.join(dir, "last-message.txt");
  const argv = buildExecArgv({
    resumeSessionId: ctx.resumeSessionId,
    model: ctx.model,
    sandbox: ctx.sandbox,
    effort: ctx.effort,
    fast: ctx.fast,
    lastMessageFile,
    ephemeral: ctx.ephemeral,
    prompt: ctx.prompt,
  });

  let exitCode = null;
  let timedOut = false;
  let spawnError = null;
  try {
    const res = await spawnCodex({
      argv,
      cwd,
      timeoutSec: ctx.timeoutSec,
      eventsPath: path.join(dir, "events.jsonl"),
      stderrPath: path.join(dir, "stderr.log"),
      onSpawn: (pid) => writeMeta(dir, { codex_pid: pid, worker_pid: process.pid }),
      onLine: (line) => {
        collector.line(line);
        if (collector.data.sessionId) {
          const meta = readMeta(dir);
          if (meta && !meta.session_id) writeMeta(dir, { session_id: collector.data.sessionId });
        }
      },
    });
    exitCode = res.exitCode;
    timedOut = res.timedOut;
  } catch (err) {
    spawnError = err;
  }

  const status = spawnError ? "failed" : timedOut ? "timeout" : exitCode === 0 ? "ok" : "failed";
  const gitAfter = ctx.sandbox === "read-only" ? null : gitChangedPaths(cwd);
  const filesGit =
    gitBefore && gitAfter ? gitAfter.filter((p) => !gitBefore.includes(p)) : gitAfter ?? undefined;

  const prevFiles = prevMeta?.files ?? [];
  const fileMap = new Map(prevFiles.map((f) => [f.path, f.kind]));
  for (const [p, kind] of collector.data.files) fileMap.set(p, kind);
  const prevUsage = prevMeta?.usage ?? { input: 0, cached: 0, output: 0 };

  const sessionId = collector.data.sessionId ?? ctx.resumeSessionId ?? prevMeta?.session_id ?? null;
  const meta = writeMeta(dir, {
    status,
    exit_code: exitCode,
    ended_at: new Date().toISOString(),
    duration_s: Math.round((Date.now() - started) / 1000),
    session_id: sessionId,
    usage: {
      input: prevUsage.input + collector.data.usage.input,
      cached: prevUsage.cached + collector.data.usage.cached,
      output: prevUsage.output + collector.data.usage.output,
    },
    files: [...fileMap.entries()].map(([p, kind]) => ({ path: p, kind })),
    files_git: filesGit,
    commands: [...(prevMeta?.commands ?? []), ...collector.data.commands],
    errors: [...(prevMeta?.errors ?? []), ...collector.data.errors],
    error: spawnError ? String(spawnError) : undefined,
  });

  recordRunEnd(
    cwd,
    runId,
    { status, dur_s: meta.duration_s, pid: null },
    status === "ok" && sessionId && !ctx.ephemeral ? { agent: ctx.agent, sessionId } : null
  );
  return { runId, dir, status };
}

export async function runCommand(argv) {
  const ctx = prepareRun(argv);
  if (ctx.dangerous) {
    process.stderr.write("⚠ sandbox=danger-full-access: codex runs WITHOUT filesystem isolation\n");
  }
  guardConcurrentWrite(ctx.cwd, ctx.sandbox);
  if (ctx.background) {
    const { startBackground } = await import("./background.mjs");
    return startBackground(ctx);
  }
  const { dir, status } = await executeRun(ctx);
  process.stdout.write(renderRun(dir));
  return status === "ok" ? 0 : 1;
}
