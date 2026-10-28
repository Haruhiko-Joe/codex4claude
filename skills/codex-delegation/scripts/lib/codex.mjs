import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { finished } from "node:stream/promises";

export const MODEL = process.env.CODEX4CLAUDE_MODEL || "gpt-6-astra";
export const MIN_CODEX_VERSION = "0.153.4";
export const EFFORTS = ["low", "medium", "high", "xhigh", "max", "ultra"];

let cachedBin;
export function resolveCodexBin() {
  if (cachedBin !== undefined) return cachedBin;
  if (process.env.CODEX_BIN && existsSync(process.env.CODEX_BIN)) {
    cachedBin = process.env.CODEX_BIN;
    return cachedBin;
  }
  const which = spawnSync("which", ["codex"], { encoding: "utf8" });
  if (which.status === 0 && which.stdout.trim()) {
    cachedBin = which.stdout.trim();
    return cachedBin;
  }
  const fallback = path.join(homedir(), ".npm-global", "bin", "codex");
  cachedBin = existsSync(fallback) ? fallback : null;
  return cachedBin;
}

export function buildExecArgv({ resumeSessionId, model, sandbox, effort, fast, lastMessageFile, ephemeral }) {
  const argv = ["exec"];
  if (resumeSessionId) argv.push("resume", resumeSessionId);
  argv.push("--json", "--skip-git-repo-check", "-m", model, "-o", lastMessageFile);
  if (sandbox) {
    // `exec resume` has no -s flag; sandbox_mode config override works on both.
    if (resumeSessionId) argv.push("-c", `sandbox_mode="${sandbox}"`);
    else argv.push("-s", sandbox);
  }
  if (effort) argv.push("-c", `model_reasoning_effort="${effort}"`);
  if (fast) argv.push("-c", `service_tier="priority"`);
  if (ephemeral) argv.push("--ephemeral");
  argv.push("-");
  return argv;
}

// Spawns codex, tees stdout JSONL to eventsPath while feeding onLine, stderr to
// stderrPath. Kills the whole process group on timeout. Resolves with exit info.
export function spawnCodex({ argv, prompt, cwd, timeoutSec, eventsPath, stderrPath, onLine, onSpawn }) {
  const bin = resolveCodexBin();
  if (!bin) throw new Error("codex CLI not found (install codex or set CODEX_BIN)");
  return new Promise((resolve, reject) => {
    const child = spawn(bin, argv, {
      cwd,
      detached: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.once("spawn", () => onSpawn?.(child.pid));
    const events = createWriteStream(eventsPath, { flags: "a" });
    const stderr = createWriteStream(stderrPath, { flags: "a" });
    let failure = null;
    const stop = () => {
      if (!child.pid) return;
      try { process.kill(-child.pid, "SIGKILL"); } catch {}
    };
    const fail = (err) => {
      failure ??= err;
      stop();
    };
    events.on("error", fail);
    stderr.on("error", fail);
    child.stderr.pipe(stderr);
    const rl = readline.createInterface({ input: child.stdout });
    rl.on("line", (line) => {
      events.write(line + "\n");
      try { onLine?.(line); } catch (err) { fail(err); }
    });

    let timedOut = false;
    const timer = timeoutSec
      ? setTimeout(() => {
          timedOut = true;
          stop();
        }, timeoutSec * 1000)
      : null;

    child.on("error", fail);
    child.stdin.on("error", (err) => {
      // A CLI that exits before reading stdin reports its own error on stderr.
      if (err.code !== "EPIPE") fail(err);
    });
    child.stdin.end(prompt);
    child.on("close", async (code) => {
      if (timer) clearTimeout(timer);
      events.end();
      stderr.end();
      const logs = await Promise.allSettled([finished(events), finished(stderr)]);
      for (const result of logs) {
        if (result.status === "rejected") failure ??= result.reason;
      }
      if (failure) return reject(failure);
      resolve({ exitCode: code, timedOut, pid: child.pid });
    });
  });
}
