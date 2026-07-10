import { spawn } from "node:child_process";
import { existsSync, openSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, UsageError } from "./args.mjs";
import { ensureDir, runDir, runsDir } from "./paths.mjs";
import { readMeta, renderRun } from "./report.mjs";
import { readState, recordRunEnd, recordRunStart } from "./state.mjs";
import { executeRun, writeMeta } from "./run.mjs";

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "codex4claude.mjs");

function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function newRunId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `r-${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}-${Math.random().toString(16).slice(2, 6)}`;
}

export async function startBackground(ctx) {
  const runId = newRunId();
  const dir = ensureDir(runDir(ctx.cwd, runId));
  writeFileSync(path.join(dir, "ctx.json"), JSON.stringify({ ...ctx, runId, background: false }));
  writeMeta(dir, {
    run_id: runId,
    agent: ctx.agent,
    cwd: ctx.cwd,
    sandbox: ctx.sandbox,
    status: "running",
    started_at: new Date().toISOString(),
    title: ctx.rawPrompt.split("\n")[0].slice(0, 60),
  });

  const workerLog = openSync(path.join(dir, "worker.log"), "a");
  const child = spawn(process.execPath, [SCRIPT, "run-worker", dir], {
    detached: true,
    stdio: ["ignore", workerLog, workerLog],
  });
  child.unref();
  recordRunStart(ctx.cwd, {
    id: runId,
    agent: ctx.agent,
    status: "running",
    sandbox: ctx.sandbox,
    pid: child.pid,
    started_at: new Date().toISOString(),
    title: ctx.rawPrompt.split("\n")[0].slice(0, 60),
  });
  process.stdout.write(
    `CODEX RUN started run=${runId} agent=${ctx.agent} (background, worker pid ${child.pid})\n` +
      `LOG: ${dir}\n` +
      `NEXT: node "${SCRIPT}" status ${runId}   # poll; then: result ${runId}\n`
  );
  return 0;
}

// Hidden subcommand executed by the detached worker process.
export async function runWorker(argv) {
  const dir = argv[0];
  const ctx = JSON.parse(readFileSync(path.join(dir, "ctx.json"), "utf8"));
  try {
    await executeRun(ctx);
  } catch (err) {
    writeMeta(dir, { status: "failed", error: String(err), ended_at: new Date().toISOString() });
    recordRunEnd(ctx.cwd, ctx.runId, { status: "failed", pid: null }, null);
    return 1;
  }
  return 0;
}

function lastEventSummary(dir) {
  const file = path.join(dir, "events.jsonl");
  if (!existsSync(file)) return "(no events yet)";
  const lines = readFileSync(file, "utf8").trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const ev = JSON.parse(lines[i]);
      const label = ev.item?.type ? `${ev.type}/${ev.item.type}` : ev.type;
      const detail = ev.item?.command ?? ev.item?.text ?? "";
      return `${label} ${String(detail).slice(0, 80)}`.trim();
    } catch {}
  }
  return "(no events yet)";
}

// Detect a run whose worker died without finalizing meta.json.
function reconcile(cwd, id) {
  const dir = runDir(cwd, id);
  const meta = readMeta(dir);
  if (!meta) return null;
  if (meta.status === "running" && !pidAlive(meta.worker_pid) && !pidAlive(meta.codex_pid)) {
    writeMeta(dir, { status: "failed", error: "worker died before finalizing", ended_at: new Date().toISOString() });
    recordRunEnd(cwd, id, { status: "failed", pid: null }, null);
    return readMeta(dir);
  }
  return meta;
}

export async function jobCommand(cmd, argv) {
  const { flags, positionals } = parseArgs(argv, {
    cd: "string",
    tail: "string",
    grep: "string",
    type: "string",
  });
  const cwd = path.resolve(flags.cd ?? process.cwd());
  const id = positionals[0];

  switch (cmd) {
    case "status": {
      if (!id) {
        const runs = readState(cwd).runs.slice(0, 10);
        if (runs.length === 0) {
          process.stdout.write(`no runs recorded for this workspace (${runsDir(cwd)})\n`);
          return 0;
        }
        for (const r of runs) {
          const meta = reconcile(cwd, r.id);
          const status = meta?.status ?? r.status;
          process.stdout.write(
            `${r.id}  ${String(r.agent).padEnd(16)} ${String(status).padEnd(8)} ${r.dur_s ?? "?"}s  ${r.title ?? ""}\n`
          );
        }
        return 0;
      }
      const meta = reconcile(cwd, id);
      if (!meta) throw new UsageError(`run "${id}" not found in this workspace`);
      if (meta.status === "running") {
        const elapsed = Math.round((Date.now() - Date.parse(meta.started_at)) / 1000);
        process.stdout.write(
          `CODEX RUN running run=${id} agent=${meta.agent} elapsed=${elapsed}s\n` +
            `last: ${lastEventSummary(runDir(cwd, id))}\nLOG: ${runDir(cwd, id)}\n`
        );
        return 0;
      }
      process.stdout.write(renderRun(runDir(cwd, id)));
      return meta.status === "ok" ? 0 : 1;
    }
    case "result": {
      if (!id) throw new UsageError("result <run-id>");
      const meta = reconcile(cwd, id);
      if (!meta) throw new UsageError(`run "${id}" not found in this workspace`);
      process.stdout.write(renderRun(runDir(cwd, id)));
      return meta.status === "ok" ? 0 : 1;
    }
    case "log": {
      if (!id) throw new UsageError("log <run-id> [--tail N] [--grep P] [--type T]");
      const file = path.join(runDir(cwd, id), "events.jsonl");
      if (!existsSync(file)) throw new UsageError(`no events for run "${id}"`);
      let lines = readFileSync(file, "utf8").trim().split("\n");
      if (flags.type) {
        lines = lines.filter((l) => {
          try {
            const ev = JSON.parse(l);
            return ev.type === flags.type || ev.item?.type === flags.type;
          } catch {
            return false;
          }
        });
      }
      if (flags.grep) lines = lines.filter((l) => l.includes(flags.grep));
      const tail = flags.tail ? Number(flags.tail) : 20;
      const maxLen = flags.grep ? 500 : 200;
      for (const l of lines.slice(-tail)) {
        process.stdout.write((l.length > maxLen ? l.slice(0, maxLen) + "…" : l) + "\n");
      }
      return 0;
    }
    case "cancel": {
      if (!id) throw new UsageError("cancel <run-id>");
      const meta = readMeta(runDir(cwd, id));
      if (!meta) throw new UsageError(`run "${id}" not found in this workspace`);
      if (meta.status !== "running") {
        process.stdout.write(`run ${id} already ${meta.status}\n`);
        return 0;
      }
      for (const pid of [meta.codex_pid, meta.worker_pid]) {
        if (!pidAlive(pid)) continue;
        try {
          process.kill(-pid, "SIGKILL"); // codex is its own group leader
        } catch {
          try {
            process.kill(pid, "SIGKILL");
          } catch {}
        }
      }
      writeMeta(runDir(cwd, id), { status: "cancelled", ended_at: new Date().toISOString() });
      recordRunEnd(cwd, id, { status: "cancelled", pid: null }, null);
      process.stdout.write(`cancelled run ${id}\n`);
      return 0;
    }
    default:
      throw new UsageError(`unknown job command "${cmd}"`);
  }
}
