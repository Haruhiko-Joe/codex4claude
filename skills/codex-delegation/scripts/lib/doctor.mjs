import { spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { resolveCodexBin, MIN_CODEX_VERSION, MODEL } from "./codex.mjs";
import { dataDir, ensureDir } from "./paths.mjs";

export function doctor() {
  const lines = [];
  let ok = true;

  const bin = resolveCodexBin();
  if (!bin) {
    lines.push("codex CLI: NOT FOUND (install codex or set CODEX_BIN)");
    ok = false;
  } else {
    const version = spawnSync(bin, ["--version"], { encoding: "utf8" });
    if (version.status === 0) {
      lines.push(`codex CLI: ${version.stdout.trim()} (${bin})`);
      if (!supportsCodexVersion(version.stdout)) {
        lines.push(`codex CLI: requires stable version >= ${MIN_CODEX_VERSION}; update Codex before running tasks`);
        ok = false;
      }
    } else {
      lines.push(`codex CLI: found at ${bin} but --version failed: ${version.stderr?.trim()}`);
      ok = false;
    }
  }

  lines.push(`model: ${MODEL}`);

  const data = dataDir();
  try {
    ensureDir(data);
    accessSync(data, constants.W_OK);
    lines.push(`data dir: ${data} (writable)`);
  } catch (err) {
    lines.push(`data dir: ${data} NOT WRITABLE (${err.message})`);
    ok = false;
  }

  lines.push(ok ? "doctor: OK" : "doctor: PROBLEMS FOUND");
  process.stdout.write(lines.join("\n") + "\n");
  return ok ? 0 : 1;
}

export function supportsCodexVersion(version) {
  const match = version.trim().match(/^codex-cli (\d+)\.(\d+)\.(\d+)(?:\s|$)/);
  if (!match) return false;
  const current = match.slice(1).map(Number);
  const minimum = MIN_CODEX_VERSION.split(".").map(Number);
  for (let i = 0; i < minimum.length; i++) {
    if (current[i] !== minimum[i]) return current[i] > minimum[i];
  }
  return true;
}
