import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PLUGIN_ROOT } from "./paths.mjs";

const SCRIPT = path.join(PLUGIN_ROOT, "scripts", "codex4claude.mjs");
const MAX_MESSAGE_BYTES = 10_000;

function fmtTokens(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

export function readMeta(dir) {
  const file = path.join(dir, "meta.json");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function renderRun(dir) {
  const meta = readMeta(dir);
  if (!meta) return `no run found at ${dir}\n`;
  const lines = [];
  const usage = meta.usage ?? { input: 0, cached: 0, output: 0 };
  lines.push(
    `CODEX RUN ${meta.status}  run=${meta.run_id}  agent=${meta.agent}  ` +
      `session=${meta.session_id ?? "?"}  turn=${meta.turns ?? 1}  ` +
      `effort=${meta.effort ?? "default"}${meta.fast ? " fast" : ""}  ${meta.duration_s ?? "?"}s  ` +
      `tok:in ${fmtTokens(usage.input)}(${fmtTokens(usage.cached)} cached)/out ${fmtTokens(usage.output)}`
  );
  lines.push("");

  const lmFile = path.join(dir, "last-message.txt");
  if (meta.status === "running") {
    lines.push("(still running — use `status` to poll)");
  } else if (existsSync(lmFile)) {
    let msg = readFileSync(lmFile, "utf8").trim();
    if (Buffer.byteLength(msg) > MAX_MESSAGE_BYTES) {
      msg = msg.slice(0, MAX_MESSAGE_BYTES) + `\n… [truncated, full text: ${lmFile}]`;
    }
    lines.push(msg);
  } else {
    lines.push(`(no final message — codex produced no answer; see stderr below)`);
  }

  lines.push("");
  lines.push("── run info ──");
  const rel = (p) => (meta.cwd && p.startsWith(meta.cwd + path.sep) ? p.slice(meta.cwd.length + 1) : p);
  const fileEntries = new Map((meta.files ?? []).map((f) => [rel(f.path), f.kind]));
  for (const p of (meta.files_git ?? []).map(rel)) {
    const known = [...fileEntries.keys()].some((e) => e.endsWith(p) || p.endsWith(e));
    if (!known) fileEntries.set(p, null);
  }
  if (fileEntries.size > 0) {
    lines.push(`files: ${[...fileEntries].map(([p, k]) => (k ? `${p}(${k})` : p)).join(", ")}`);
  }
  const commands = meta.commands ?? [];
  if (commands.length > 0) {
    const shown = commands.slice(-10);
    if (commands.length > shown.length) lines.push(`cmds: (${commands.length - shown.length} earlier omitted)`);
    for (const c of shown) {
      const cmd = c.command.length > 90 ? c.command.slice(0, 90) + "…" : c.command;
      lines.push(`cmd: ${cmd} → exit ${c.exit ?? "?"}`);
    }
  }
  if (fileEntries.size === 0 && commands.length === 0) {
    lines.push("(no file changes or commands recorded)");
  }
  if (meta.errors?.length) {
    lines.push(`errors: ${meta.errors.slice(-3).join(" | ")}`);
  }
  if (meta.status === "failed" || meta.status === "timeout") {
    const stderrFile = path.join(dir, "stderr.log");
    if (existsSync(stderrFile)) {
      const tail = readFileSync(stderrFile, "utf8").trim().split("\n").slice(-10);
      if (tail.length && tail[0] !== "") {
        lines.push("stderr tail:");
        for (const l of tail) lines.push(`  ${l}`);
      }
    }
  }
  lines.push(`LOG: ${dir}`);
  if (meta.status === "ok") {
    lines.push(`NEXT: node "${SCRIPT}" run ${meta.agent} --continue "<feedback>"   # same session`);
  } else if (meta.status === "timeout") {
    lines.push(`NEXT: session survives; continue with: node "${SCRIPT}" run ${meta.agent} --continue "<instruction>"`);
  } else if (meta.status === "running") {
    lines.push(`NEXT: node "${SCRIPT}" status ${meta.run_id}`);
  }
  return lines.join("\n") + "\n";
}
