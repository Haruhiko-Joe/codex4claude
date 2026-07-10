import assert from "node:assert/strict";
import { test } from "node:test";
import { parseArgs, UsageError } from "../lib/args.mjs";
import { createEventCollector } from "../lib/events.mjs";
import { parseFrontmatter, serializeFrontmatter } from "../lib/frontmatter.mjs";
import { workspaceSlug } from "../lib/paths.mjs";

test("parseArgs: booleans, values, positionals, unknown flag", () => {
  const { flags, positionals } = parseArgs(
    ["implementer", "--write", "--effort", "high", "--timeout=60", "do the thing"],
    { write: "boolean", effort: "string", timeout: "string" }
  );
  assert.deepEqual(flags, { write: true, effort: "high", timeout: "60" });
  assert.deepEqual(positionals, ["implementer", "do the thing"]);
  assert.throws(() => parseArgs(["--nope"], {}), UsageError);
});

test("frontmatter round trip", () => {
  const src = serializeFrontmatter(
    { name: "x", description: "a: b — c", sandbox: "read-only" },
    "# Body\ntext"
  );
  const { meta, body } = parseFrontmatter(src);
  assert.equal(meta.name, "x");
  assert.equal(meta.description, "a: b — c");
  assert.equal(meta.sandbox, "read-only");
  assert.equal(body.trim(), "# Body\ntext");
});

test("frontmatter: no frontmatter means empty meta", () => {
  const { meta, body } = parseFrontmatter("just text");
  assert.deepEqual(meta, {});
  assert.equal(body, "just text");
});

// Fixture lines recorded from codex-cli 0.144.0 `exec --json`.
test("event collector extracts session, message, files, commands, usage", () => {
  const c = createEventCollector();
  const lines = [
    '{"type":"thread.started","thread_id":"019f-abc"}',
    '{"type":"turn.started"}',
    '{"type":"item.started","item":{"id":"item_1","type":"command_execution","command":"npm test","exit_code":null,"status":"in_progress"}}',
    '{"type":"item.completed","item":{"id":"item_1","type":"command_execution","command":"npm test","aggregated_output":"ok","exit_code":0}}',
    '{"type":"item.completed","item":{"id":"item_2","type":"file_change","changes":[{"path":"/w/a.ts","kind":"update"}]}}',
    '{"type":"item.completed","item":{"id":"item_3","type":"agent_message","text":"done"}}',
    '{"type":"turn.completed","usage":{"input_tokens":100,"cached_input_tokens":40,"output_tokens":9}}',
    "not json at all",
    '{"type":"future.unknown_event","x":1}',
  ];
  for (const l of lines) c.line(l);
  assert.equal(c.data.sessionId, "019f-abc");
  assert.equal(c.data.lastAgentMessage, "done");
  assert.deepEqual([...c.data.files.entries()], [["/w/a.ts", "update"]]);
  assert.deepEqual(c.data.commands, [{ command: "npm test", exit: 0 }]);
  assert.deepEqual(c.data.usage, { input: 100, cached: 40, output: 9 });
  assert.equal(c.data.errors.length, 0);
});

test("workspaceSlug is stable and filesystem-safe", () => {
  const a = workspaceSlug("/tmp");
  assert.equal(a, workspaceSlug("/tmp"));
  assert.match(a, /^[A-Za-z0-9._-]+-[0-9a-f]{8}$/);
});
