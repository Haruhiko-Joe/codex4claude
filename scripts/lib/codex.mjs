import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import readline from "node:readline";

export const MODEL = process.env.CODEX4CLAUDE_MODEL || "gpt-5.6-sol";

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

export function buildExecArgv({ resumeSessionId, model, sandbox, effort, lastMessageFile, ephemeral, prompt }) {
  const argv = ["exec"];
  if (resumeSessionId) argv.push("resume", resumeSessionId);
  argv.push("--json", "--skip-git-repo-check", "-m", model, "-o", lastMessageFile);
  if (sandbox) {
    // `exec resume` has no -s flag; sandbox_mode config override works on both.
    if (resumeSessionId) argv.push("-c", `sandbox_mode="${sandbox}"`);
    else argv.push("-s", sandbox);
  }
  if (effort) argv.push("-c", `model_reasoning_effort="${effort}"`);
  if (ephemeral) argv.push("--ephemeral");
  argv.push(prompt);
  return argv;
}

// Spawns codex, tees stdout JSONL to eventsPath while feeding onLine, stderr to
// stderrPath. Kills the whole process group on timeout. Resolves with exit info.
export function spawnCodex({ argv, cwd, timeoutSec, eventsPath, stderrPath, onLine, onSpawn }) {
  const bin = resolveCodexBin();
  if (!bin) throw new Error("codex CLI not found (install codex or set CODEX_BIN)");
  return new Promise((resolve, reject) => {
    const child = spawn(bin, argv, {
      cwd,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    onSpawn?.(child.pid);
    const events = createWriteStream(eventsPath, { flags: "a" });
    const stderr = createWriteStream(stderrPath, { flags: "a" });
    child.stderr.pipe(stderr);
    const rl = readline.createInterface({ input: child.stdout });
    rl.on("line", (line) => {
      events.write(line + "\n");
      onLine?.(line);
    });

    let timedOut = false;
    const timer = timeoutSec
      ? setTimeout(() => {
          timedOut = true;
          try {
            process.kill(-child.pid, "SIGKILL");
          } catch {}
        }, timeoutSec * 1000)
      : null;

    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      events.end();
      stderr.end();
      resolve({ exitCode: code, timedOut, pid: child.pid });
    });
  });
}
