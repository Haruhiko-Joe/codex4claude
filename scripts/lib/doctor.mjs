import { spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { resolveCodexBin, MODEL } from "./codex.mjs";
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
