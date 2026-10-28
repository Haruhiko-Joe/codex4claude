import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { workspaceSlug } from "../../skills/codex-delegation/scripts/lib/paths.mjs";

const script = fileURLToPath(new URL("../../skills/codex-delegation/scripts/codex4claude.mjs", import.meta.url));
const fixture = fileURLToPath(new URL("./fixtures/fake-codex.mjs", import.meta.url));
const json = (file) => JSON.parse(readFileSync(file, "utf8"));

function setup(t) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "codex4claude-test-")));
  const cwd = path.join(root, "workspace ' $() `");
  const data = path.join(root, "data");
  const bin = path.join(root, "codex.mjs");
  mkdirSync(cwd);
  copyFileSync(fixture, bin);
  chmodSync(bin, 0o755);
  const env = { ...process.env, CODEX_BIN: bin, CODEX4CLAUDE_DATA: data, CODEX4CLAUDE_MODEL: "", FAKE_CODEX_SCENARIO: "ok" };
  delete env.CLAUDE_PLUGIN_ROOT;
  delete env.CLAUDE_PLUGIN_DATA;
  delete env.CLAUDE_SKILL_DIR;
  const run = (argv, options = {}) => {
    const result = spawnSync(process.execPath, [options.script ?? script, ...argv], {
      cwd: options.cwd ?? cwd, encoding: "utf8", input: options.input ?? "", timeout: 8000, maxBuffer: 2_000_000,
      env: { ...env, ...options.env },
    });
    if (result.error) throw result.error;
    return result;
  };
  const stateDir = path.join(data, "state", workspaceSlug(cwd));
  const runsDir = path.join(stateDir, "runs");
  t.after(() => {
    if (existsSync(runsDir)) {
      for (const id of readdirSync(runsDir)) {
        const metaFile = path.join(runsDir, id, "meta.json");
        if (existsSync(metaFile) && json(metaFile).status === "running") run(["cancel", id]);
      }
    }
    rmSync(root, { recursive: true, force: true });
  });
  const inspect = (result) => {
    const id = result.stdout.match(/\brun=(r-[\w-]+)/)?.[1];
    assert.ok(id, result.stdout + result.stderr);
    const dir = path.join(runsDir, id);
    return { id, dir, meta: json(path.join(dir, "meta.json")) };
  };
  return { root, cwd, data, bin, env, run, inspect, stateDir, runsDir };
}

async function waitFor(check) {
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    if (check()) return;
    await delay(20);
  }
  assert.fail("timed out waiting for fixture run");
}

test("foreground: default Astra, raw stdin, final report, evidence, and old definitions untouched", (t) => {
  const f = setup(t);
  const definitions = [path.join(f.cwd, ".claude", "codex-agents"), path.join(f.data, "agents")];
  for (const dir of definitions) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "implementer.md"), "old role must not be injected");
  }
  const task = "\nRead `literal` and $(literal).\n中文任务 🧪\n";
  const result = f.run(["run"], { input: task });
  assert.equal(result.status, 0, result.stderr);
  const { dir, meta } = f.inspect(result);
  assert.equal(meta.model, "gpt-6-astra");
  assert.equal(meta.sandbox, "read-only");
  assert.equal(meta.effort, null);
  assert.equal(Object.hasOwn(meta, "agent"), false);
  const received = json(path.join(dir, "received.json"));
  assert.equal(received.prompt, task);
  assert.equal(received.argv.at(-1), "-");
  assert.equal(received.argv.includes(task), false);
  assert.match(result.stdout, /fixture final report/);
  assert.doesNotMatch(result.stdout, /fixture progress|event text is not the report|agent=/);
  assert.match(result.stdout, /cmd: fixture-check → exit 0/);
  assert.deepEqual(meta.usage, { input: 100, cached: 40, output: 9 });
  assert.match(readFileSync(path.join(dir, "events.jsonl"), "utf8"), /future.unknown_event/);
  assert.doesNotMatch(readFileSync(path.join(dir, "prompt.txt"), "utf8"), /system_instructions|old role/);
  const state = json(path.join(f.stateDir, "state.json"));
  assert.equal(Object.hasOwn(state, "agents"), false);
  assert.equal(Object.hasOwn(state.runs[0], "agent"), false);
  for (const definition of definitions) assert.ok(existsSync(path.join(definition, "implementer.md")));
  assert.match(f.run(["log", meta.run_id, "--grep", "future.unknown"]).stdout, /future.unknown_event/);
});

test("input precedence and large stdin do not put task text in argv", (t) => {
  const f = setup(t);
  const promptFile = path.join(f.root, "task.txt");
  writeFileSync(promptFile, "file task\n");
  const cases = [
    { argv: ["run", "argument", "--prompt-file", promptFile], input: "stdin", expected: "file task\n" },
    { argv: ["run", "argument"], input: "stdin", expected: "argument" },
    { argv: ["run"], input: "long 中文 `$()`\n".repeat(40_000) },
  ];
  for (const c of cases) {
    const result = f.run(c.argv, { input: c.input });
    assert.equal(result.status, 0, result.stderr);
    const received = json(path.join(f.inspect(result).dir, "received.json"));
    assert.equal(received.prompt, c.expected ?? c.input);
    assert.ok(received.argv.join(" ").length < 1000);
  }
  writeFileSync(promptFile, " \n");
  for (const argv of [["run"], ["run", " "], ["run", "--prompt-file", promptFile]]) {
    const result = f.run(argv, { input: " \n" });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /empty prompt/);
  }
});

test("resume and generated NEXT preserve session, workspace, permissions, effort, and Fast", (t) => {
  const f = setup(t);
  const result = f.run(["run", "follow-up", "--session", "session-'quoted", "--write", "--effort", "ultra", "--fast"]);
  assert.equal(result.status, 0, result.stderr);
  const { dir, meta } = f.inspect(result);
  const received = json(path.join(dir, "received.json"));
  assert.deepEqual(received.argv.slice(0, 3), ["exec", "resume", "session-'quoted"]);
  assert.ok(received.argv.includes('sandbox_mode="workspace-write"'));
  assert.ok(received.argv.includes('model_reasoning_effort="ultra"'));
  assert.ok(received.argv.includes('service_tier="priority"'));
  const next = result.stdout.split("\n").find((line) => line.startsWith("NEXT: ")).slice(6);
  const resumed = spawnSync("/bin/sh", ["-c", next], { cwd: f.root, env: f.env, encoding: "utf8", timeout: 8000 });
  assert.equal(resumed.status, 0, resumed.stderr);
  const after = f.inspect(resumed).meta;
  assert.equal(after.session_id, meta.session_id);
  assert.equal(after.cwd, f.cwd);
  assert.equal(after.sandbox, "workspace-write");
  assert.equal(after.effort, "ultra");
  assert.equal(after.fast, true);
});

test("model override and doctor version failure use only the configured binary", (t) => {
  const f = setup(t);
  const result = f.run(["run", "task"], { env: { CODEX4CLAUDE_MODEL: "gpt-5.6-sol" } });
  assert.equal(f.inspect(result).meta.model, "gpt-5.6-sol");
  const doctor = f.run(["doctor"]);
  assert.equal(doctor.status, 0, doctor.stderr);
  assert.match(doctor.stdout, /model: gpt-6-astra/);
  const old = f.run(["doctor"], { env: { FAKE_CODEX_VERSION: "codex-cli 0.144.0" } });
  assert.equal(old.status, 1);
  assert.match(old.stdout, /requires stable version >= 0.153.4/);
});

test("retired commands fail with migration guidance before running Codex", (t) => {
  const f = setup(t);
  for (const [argv, message] of [
    [["agent", "list"], /agent commands were removed/],
    [["run", "task", "--continue"], /use --session/],
    [["run", "implementer", "task"], /without an agent name/],
  ]) {
    const result = f.run(argv);
    assert.equal(result.status, 2);
    assert.match(result.stderr, message);
  }
  assert.equal(existsSync(f.runsDir), false);
});

for (const scenario of ["failed-event", "failed-exit", "no-final", "no-completion", "early-exit"]) {
  test(`failure is not success: ${scenario}`, (t) => {
    const f = setup(t);
    const result = f.run(["run"], { input: "task\n".repeat(40_000), env: { FAKE_CODEX_SCENARIO: scenario } });
    assert.equal(result.status, 1, result.stderr);
    assert.equal(f.inspect(result).meta.status, "failed");
    assert.match(result.stdout, /CODEX RUN failed/);
    assert.doesNotMatch(result.stdout, /fixture progress/);
  });
}

test("spawn errors are recorded and printed", (t) => {
  const f = setup(t);
  chmodSync(f.bin, 0o600);
  const result = f.run(["run", "task"]);
  assert.equal(result.status, 1);
  assert.equal(f.inspect(result).meta.status, "failed");
  assert.match(result.stdout, /EACCES/);
});

test("ephemeral and missing sessions never suggest continuation", (t) => {
  const f = setup(t);
  const ephemeral = f.run(["run", "task", "--ephemeral"]);
  assert.equal(ephemeral.status, 0, ephemeral.stderr);
  assert.equal(f.inspect(ephemeral).meta.ephemeral, true);
  assert.doesNotMatch(ephemeral.stdout, /NEXT:/);
  const missing = f.run(["run", "task"], { env: { FAKE_CODEX_SCENARIO: "no-session" } });
  assert.equal(missing.status, 0, missing.stderr);
  assert.doesNotMatch(missing.stdout, /NEXT:/);
});

test("foreground timeout retains the actual session ID", (t) => {
  const f = setup(t);
  const result = f.run(["run", "task", "--timeout", "0.5"], { env: { FAKE_CODEX_SCENARIO: "hang" } });
  assert.equal(result.status, 1);
  const { meta } = f.inspect(result);
  assert.equal(meta.status, "timeout");
  assert.ok(meta.session_id);
  assert.match(result.stdout, /NEXT: .*--session/);
  assert.ok(result.stdout.includes(meta.session_id));
});

test("background run can be polled immediately and replayed after completion", async (t) => {
  const f = setup(t);
  const started = f.run(["run", "task", "--background", "--timeout", "0"], { env: { FAKE_CODEX_SCENARIO: "delayed" } });
  assert.equal(started.status, 0, started.stderr);
  const { id } = f.inspect(started);
  const status = f.run(["status", id]);
  assert.equal(status.status, 0, status.stdout + status.stderr);
  await waitFor(() => !f.run(["status", id]).stdout.includes("CODEX RUN running"));
  const result = f.run(["result", id]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /fixture final report/);
  assert.doesNotMatch(result.stdout, /agent=/);
});

test("background timeout uses the requested limit", async (t) => {
  const f = setup(t);
  const started = f.run(["run", "task", "--background", "--timeout", "0.5"], { env: { FAKE_CODEX_SCENARIO: "hang" } });
  const { id, dir } = f.inspect(started);
  await waitFor(() => json(path.join(dir, "meta.json")).status !== "running");
  assert.equal(f.inspect(f.run(["result", id])).meta.status, "timeout");
});

test("active writers block another writer, allow readers, and can be cancelled", async (t) => {
  const f = setup(t);
  const started = f.run(["run", "task", "--write", "--background", "--timeout", "0"], { env: { FAKE_CODEX_SCENARIO: "hang" } });
  const { id, dir } = f.inspect(started);
  await waitFor(() => json(path.join(dir, "meta.json")).session_id);
  const blocked = f.run(["run", "second write", "--write"]);
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /another write run is active/);
  assert.equal(f.run(["run", "read only"]).status, 0);
  assert.equal(f.run(["cancel", id]).status, 0);
  const cancelled = f.run(["result", id]);
  assert.equal(f.inspect(cancelled).meta.status, "cancelled");
  assert.match(f.run(["cancel", id]).stdout, /already cancelled/);
  assert.equal(f.run(["run", "replacement", "--write"]).status, 0);
});

test("legacy run metadata and agent definitions remain readable and untouched", (t) => {
  const f = setup(t);
  const id = "r-legacy";
  const dir = path.join(f.runsDir, id);
  mkdirSync(dir, { recursive: true });
  const oldMeta = { run_id: id, agent: "implementer", status: "ok", cwd: f.cwd, sandbox: "workspace-write", session_id: "old-session", model: "gpt-5.6-sol" };
  writeFileSync(path.join(dir, "meta.json"), JSON.stringify(oldMeta));
  writeFileSync(path.join(dir, "last-message.txt"), "historical report");
  const agents = { implementer: { last_session: "old-session", last_run: id } };
  writeFileSync(path.join(f.stateDir, "state.json"), JSON.stringify({ version: 1, agents, runs: [{ id, agent: "implementer", status: "ok" }] }));
  assert.match(f.run(["status"]).stdout, /r-legacy/);
  const result = f.run(["result", id]);
  assert.match(result.stdout, /historical report/);
  assert.match(result.stdout, /--session 'old-session'/);
  assert.doesNotMatch(result.stdout, /--continue|agent=/);
  const resumed = f.run(["run", "continue task", "--session", "old-session", "--write"]);
  assert.equal(resumed.status, 0);
  assert.deepEqual(json(path.join(dir, "meta.json")), oldMeta);
  assert.deepEqual(json(path.join(f.stateDir, "state.json")).agents, agents);
});

for (const target of ["code", "cowork"]) {
  test(`${target} skill runs independently after extraction to a path with shell metacharacters`, async (t) => {
    const f = setup(t);
    const skillName = target === "cowork" ? "codex-delegation-cowork" : "codex-delegation";
    const packager = fileURLToPath(new URL("../package_skill.py", import.meta.url));
    const output = path.join(f.root, "dist");
    const packed = spawnSync("python3", [packager, output, "--target", target], { cwd: f.cwd, encoding: "utf8" });
    assert.equal(packed.status, 0, packed.stderr);
    const archive = path.join(output, `${skillName}.skill`);
    if (target === "cowork") {
      assert.deepEqual(readFileSync(path.join(output, `${skillName}.zip`)), readFileSync(archive));
    }
    const installDir = path.join(f.root, "installed 技能 ' $() `");
    const extracted = spawnSync("python3", ["-c", [
      "import json, sys, zipfile",
      "with zipfile.ZipFile(sys.argv[1]) as bundle:",
      "    assert bundle.testzip() is None",
      "    print(json.dumps(bundle.namelist()))",
      "    bundle.extractall(sys.argv[2])",
    ].join("\n"), archive, installDir], { encoding: "utf8" });
    assert.equal(extracted.status, 0, extracted.stderr);
    const entries = JSON.parse(extracted.stdout);
    assert.ok(entries.includes(`${skillName}/SKILL.md`));
    assert.ok(entries.includes(`${skillName}/scripts/codex4claude.mjs`));
    assert.ok(entries.every((entry) => entry.startsWith(`${skillName}/`) && !entry.split("/").includes("..")));
    assert.ok(entries.every((entry) => !/test|fixture|plugin|node_modules|__pycache__|\.DS_Store/.test(entry)));
    const runtimePrefix = `${skillName}/scripts/`;
    for (const entry of entries.filter((name) => name.startsWith(runtimePrefix))) {
      assert.deepEqual(readFileSync(path.join(installDir, entry)), readFileSync(path.join(path.dirname(script), entry.slice(runtimePrefix.length))));
    }
    const installedScript = path.join(installDir, skillName, "scripts", "codex4claude.mjs");
    const run = (argv, options = {}) => f.run(argv, { ...options, script: installedScript, cwd: f.root });
    const runNext = (result) => {
      const next = result.stdout.split("\n").find((line) => line.startsWith("NEXT: "));
      assert.ok(next, result.stdout);
      assert.ok(next.includes("installed 技能"), next);
      const followed = spawnSync("/bin/sh", ["-c", next.slice(6)], {
        cwd: f.root, env: f.env, encoding: "utf8", timeout: 8000,
      });
      assert.equal(followed.status, 0, followed.stdout + followed.stderr);
      return followed;
    };

    assert.equal(run(["doctor"]).status, 0);
    const first = run(["run", "--cd", f.cwd, "--write", "--effort", "high"], { input: "packaged task 中文\n" });
    assert.equal(first.status, 0, first.stderr);
    const { dir, meta } = f.inspect(first);
    assert.equal(json(path.join(dir, "received.json")).prompt, "packaged task 中文\n");
    assert.equal(meta.cwd, f.cwd);
    const resumed = f.inspect(runNext(first)).meta;
    assert.equal(resumed.session_id, meta.session_id);
    assert.equal(resumed.cwd, f.cwd);
    assert.equal(resumed.sandbox, "workspace-write");
    assert.equal(resumed.effort, "high");

    const started = run(["run", "background task", "--cd", f.cwd, "--background", "--timeout", "0"], {
      env: { FAKE_CODEX_SCENARIO: "delayed" },
    });
    assert.equal(started.status, 0, started.stderr);
    const { id } = f.inspect(started);
    runNext(started);
    await waitFor(() => !run(["status", id, "--cd", f.cwd]).stdout.includes("CODEX RUN running"));
    const result = run(["result", id, "--cd", f.cwd]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /fixture final report/);
    assert.ok(run(["status", "--cd", f.cwd]).stdout.includes(id));
    assert.match(run(["log", id, "--cd", f.cwd, "--grep", "turn.completed"]).stdout, /turn.completed/);
  });
}
