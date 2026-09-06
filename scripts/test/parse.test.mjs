import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { parseArgs, UsageError } from "../lib/args.mjs";
import { buildExecArgv, EFFORTS } from "../lib/codex.mjs";
import { supportsCodexVersion } from "../lib/doctor.mjs";
import { createEventCollector } from "../lib/events.mjs";
import { workspaceSlug } from "../lib/paths.mjs";
import { prepareRun } from "../lib/run.mjs";

test("parseArgs: flags, positionals, delimiter, and missing values", () => {
  const spec = { write: "boolean", effort: "string", timeout: "string" };
  assert.deepEqual(parseArgs(["--write", "--effort", "high", "--timeout=60", "do the thing"], spec), {
    flags: { write: true, effort: "high", timeout: "60" }, positionals: ["do the thing"],
  });
  assert.deepEqual(parseArgs(["--", "--write"], spec).positionals, ["--write"]);
  for (const argv of [["--nope"], ["--effort"], ["--effort="], ["--effort", "--write"]]) {
    assert.throws(() => parseArgs(argv, spec), UsageError);
  }
});

test("prepareRun: raw task, permission defaults, effort, and timeout", async () => {
  const task = "  Keep `identifiers` and $(literal) intact.\n中文任务\n";
  const ctx = await prepareRun([task]);
  assert.equal(ctx.prompt, task);
  assert.equal(ctx.sandbox, "read-only");
  assert.equal(ctx.effort, undefined);
  assert.equal(ctx.timeoutSec, 540);
  assert.equal(ctx.resumeSessionId, null);
  assert.equal(Object.hasOwn(ctx, "agent"), false);
  for (const effort of EFFORTS) {
    assert.equal((await prepareRun(["task", "--effort", effort])).effort, effort);
  }
  const resumed = await prepareRun(["task", "--write", "--session", "session-1", "--background", "--timeout", "0"]);
  assert.equal(resumed.sandbox, "workspace-write");
  assert.equal(resumed.resumeSessionId, "session-1");
  assert.equal(resumed.timeoutSec, 0);
});

test("prepareRun: reject empty tasks, conflicting permissions, and retired arguments", async () => {
  const invalid = [
    [""], [" \n"], ["task", "--write", "--read-only"], ["task", "--write", "--dangerous"],
    ["task", "--read-only", "--dangerous"], ["task", "--effort", "minimal"], ["task", "--effort", "none"],
    ["task", "--timeout", "-1"], ["task", "--timeout", "NaN"], ["task", "--timeout", "Infinity"],
    ["task", "--timeout", "999999999"], ["task", "--session=--write"],
  ];
  for (const argv of invalid) await assert.rejects(() => prepareRun(argv), UsageError);
  await assert.rejects(() => prepareRun(["task", "--continue"]), /use --session/);
  await assert.rejects(() => prepareRun(["implementer", "task"]), /without an agent name/);
});

test("prepareRun: prompt file takes precedence and rejects whitespace", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "codex4claude-prompt-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "task.txt");
  writeFileSync(file, "\nfile task\n");
  assert.equal((await prepareRun(["argument task", "--prompt-file", file])).prompt, "\nfile task\n");
  writeFileSync(file, " \n");
  await assert.rejects(() => prepareRun(["valid argument", "--prompt-file", file]), /empty prompt/);
});

// Legacy event samples remain supported without treating messages as completion.
test("event collector extracts evidence and ignores progress and unknown events", () => {
  const c = createEventCollector();
  const lines = [
    '{"type":"thread.started","thread_id":"019f-abc"}',
    '{"type":"turn.started"}',
    '{"type":"item.completed","item":{"type":"agent_message","text":"working","phase":"commentary"}}',
    '{"type":"item.started","item":{"type":"command_execution","command":"npm test","exit_code":null}}',
    '{"type":"item.completed","item":{"type":"command_execution","command":"npm test","exit_code":0}}',
    '{"type":"item.completed","item":{"type":"file_change","changes":[{"path":"/w/a.ts","kind":"update"}]}}',
    "not json", '{"type":"future.unknown_event"}',
  ];
  for (const line of lines) c.line(line);
  assert.equal(c.data.sessionId, "019f-abc");
  assert.equal(c.data.completed, false);
  assert.deepEqual([...c.data.files], [["/w/a.ts", "update"]]);
  assert.deepEqual(c.data.commands, [{ command: "npm test", exit: 0 }]);
  c.line('{"type":"turn.completed","usage":{"input_tokens":100,"cached_input_tokens":40,"output_tokens":9,"reasoning_output_tokens":4}}');
  assert.equal(c.data.completed, true);
  assert.deepEqual(c.data.usage, { input: 100, cached: 40, output: 9 });
  c.line('{"type":"turn.failed","error":{"message":"failure"}}');
  assert.equal(c.data.failed, true);
  assert.deepEqual(c.data.errors, ["failure"]);
});

test("buildExecArgv: new sessions and resume both read the task from stdin", () => {
  const base = { model: "gpt-6-astra", sandbox: "read-only", lastMessageFile: "/r/last.txt" };
  assert.deepEqual(buildExecArgv({ ...base, effort: "ultra", fast: true }), [
    "exec", "--json", "--skip-git-repo-check", "-m", "gpt-6-astra", "-o", "/r/last.txt",
    "-s", "read-only", "-c", 'model_reasoning_effort="ultra"', "-c", 'service_tier="priority"', "-",
  ]);
  assert.deepEqual(buildExecArgv({ ...base, resumeSessionId: "019f-abc", sandbox: "workspace-write", ephemeral: true }), [
    "exec", "resume", "019f-abc", "--json", "--skip-git-repo-check", "-m", "gpt-6-astra", "-o", "/r/last.txt",
    "-c", 'sandbox_mode="workspace-write"', "--ephemeral", "-",
  ]);
});

test("doctor: stable minimum version and future minor/major versions", () => {
  for (const version of ["codex-cli 0.153.4\n", "codex-cli 0.154.0", "codex-cli 1.0.0"]) {
    assert.equal(supportsCodexVersion(version), true, version);
  }
  for (const version of ["codex-cli 0.153.3", "codex-cli 0.144.0", "codex-cli 0.153.4-alpha.1", "unknown"]) {
    assert.equal(supportsCodexVersion(version), false, version);
  }
});

test("workspaceSlug is stable and filesystem-safe", () => {
  assert.equal(workspaceSlug("/tmp"), workspaceSlug("/tmp"));
  assert.match(workspaceSlug("/tmp"), /^[A-Za-z0-9._-]+-[0-9a-f]{8}$/);
});
