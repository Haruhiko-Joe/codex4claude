import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { parseArgs, UsageError } from "./args.mjs";
import { EFFORTS, MODEL, buildExecArgv, spawnCodex } from "./codex.mjs";
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

async function readPrompt(flags, positionals) {
  if (flags["prompt-file"]) return readFileSync(flags["prompt-file"], "utf8");
  if (positionals.length) return positionals[0];
  if (process.stdin.isTTY) throw new UsageError("no prompt: pass as argument, --prompt-file, or pipe via stdin");
  process.stdin.setEncoding("utf8");
  let prompt = "";
  for await (const chunk of process.stdin) prompt += chunk;
  return prompt;
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
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(merged, null, 2));
  renameSync(tmp, file);
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
        `another write run is active in this workspace (${r.id}); ` +
          `wait, cancel it, or run read-only`
      );
    } catch (err) {
      if (err instanceof UsageError) throw err;
      // pid dead — stale entry, ignore
    }
  }
}

export async function prepareRun(argv) {
  const { flags, positionals } = parseArgs(argv, RUN_FLAGS);
  if (flags.continue) {
    throw new UsageError("--continue was removed; use --session <id> from the CODEX RUN header");
  }
  if (positionals.length > 1) {
    throw new UsageError("run now takes one quoted PROMPT without an agent name: run [PROMPT] [options]");
  }
  const cwd = path.resolve(flags.cd ?? process.cwd());
  if ([flags["read-only"], flags.write, flags.dangerous].filter(Boolean).length > 1) {
    throw new UsageError("choose only one of --read-only, --write, or --dangerous");
  }
  const sandbox = flags.dangerous ? "danger-full-access" : flags.write ? "workspace-write" : "read-only";
  const effort = flags.effort;
  if (effort !== undefined && !EFFORTS.includes(effort)) {
    throw new UsageError(`effort must be one of: ${EFFORTS.join(", ")}`);
  }

  const resumeSessionId = flags.session ?? null;
  if (resumeSessionId?.startsWith("-")) {
    throw new UsageError("--session requires a session ID, not a flag");
  }
  const timeoutSec = flags.timeout === undefined ? DEFAULT_TIMEOUT_SEC : Number(flags.timeout);
  if (!Number.isFinite(timeoutSec) || timeoutSec < 0 || timeoutSec * 1000 > 2_147_483_647) {
    throw new UsageError("--timeout must be between 0 and 2147483.647 seconds (0 disables the timeout)");
  }

  const prompt = await readPrompt(flags, positionals);
  if (!prompt.trim()) throw new UsageError("empty prompt");

  return {
    cwd,
    sandbox,
    effort,
    fast: Boolean(flags.fast),
    model: MODEL,
    prompt,
    resumeSessionId,
    ephemeral: Boolean(flags.ephemeral),
    timeoutSec,
    background: Boolean(flags.background),
    dangerous: Boolean(flags.dangerous),
  };
}

// Runs one codex turn to completion. Shared by foreground path and background worker.
export async function executeRun(ctx, onStart) {
  const { cwd } = ctx;
  const runId = ctx.runId ?? newRunId();
  const dir = ensureDir(runDir(cwd, runId));
  const prevMeta = readMeta(dir);
  const turn = (prevMeta?.turns ?? 0) + 1;

  appendFileSync(path.join(dir, "prompt.txt"), `\n==== turn ${turn} ====\n${ctx.prompt}\n`);
  const title = ctx.prompt.trimStart().split("\n")[0].slice(0, 60);
  const started = Date.now();
  writeMeta(dir, {
    run_id: runId,
    cwd,
    model: ctx.model,
    sandbox: ctx.sandbox,
    effort: ctx.effort ?? null,
    fast: Boolean(ctx.fast),
    ephemeral: Boolean(ctx.ephemeral),
    worker_pid: process.pid,
    status: "running",
    turns: turn,
    session_id: ctx.resumeSessionId ?? prevMeta?.session_id ?? null,
    started_at: prevMeta?.started_at ?? new Date(started).toISOString(),
    title: prevMeta?.title ?? title,
  });
  recordRunStart(cwd, {
    id: runId,
    status: "running",
    sandbox: ctx.sandbox,
    pid: process.pid,
    started_at: new Date(started).toISOString(),
    title,
  });
  onStart?.();

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
  });

  let exitCode = null;
  let timedOut = false;
  let spawnError = null;
  try {
    const res = await spawnCodex({
      argv,
      prompt: ctx.prompt,
      cwd,
      timeoutSec: ctx.timeoutSec,
      eventsPath: path.join(dir, "events.jsonl"),
      stderrPath: path.join(dir, "stderr.log"),
      onSpawn: (pid) => writeMeta(dir, { codex_pid: pid, worker_pid: process.pid }),
      onLine: (line) => {
        collector.line(line);
        if (collector.data.sessionId) {
          const meta = readMeta(dir);
          if (meta && meta.session_id !== collector.data.sessionId) {
            writeMeta(dir, { session_id: collector.data.sessionId });
          }
        }
      },
    });
    exitCode = res.exitCode;
    timedOut = res.timedOut;
  } catch (err) {
    spawnError = err;
  }

  const hasFinalMessage = existsSync(lastMessageFile) && readFileSync(lastMessageFile, "utf8").trim().length > 0;
  const completed = exitCode === 0 && collector.data.completed && !collector.data.failed && hasFinalMessage;
  const status = readMeta(dir)?.status === "cancelled" ? "cancelled"
    : timedOut ? "timeout" : !spawnError && completed ? "ok" : "failed";
  if (status === "failed" && !spawnError && !collector.data.failed && exitCode === 0) {
    collector.data.errors.push(hasFinalMessage ? "Codex exited without turn.completed" : "Codex produced no final message");
  }
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
    { status, dur_s: meta.duration_s, pid: null }
  );
  return { runId, dir, status };
}

export async function runCommand(argv) {
  const ctx = await prepareRun(argv);
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
