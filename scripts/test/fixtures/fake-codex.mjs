#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
if (argv[0] === "--version") {
  console.log(process.env.FAKE_CODEX_VERSION || "codex-cli 0.153.4");
  process.exit(0);
}

const scenario = process.env.FAKE_CODEX_SCENARIO || "ok";
if (scenario === "early-exit") {
  process.stderr.write("fixture startup failure\n");
  process.exit(3);
}

process.stdin.setEncoding("utf8");
let prompt = "";
for await (const chunk of process.stdin) prompt += chunk;
const output = argv[argv.indexOf("-o") + 1];
writeFileSync(path.join(path.dirname(output), "received.json"), JSON.stringify({ argv, prompt, cwd: process.cwd() }));
const emit = (event) => process.stdout.write(JSON.stringify(event) + "\n");
const session = argv[1] === "resume" ? argv[2] : "019f0000-0000-7000-8000-000000000001";
if (scenario !== "no-session") emit({ type: "thread.started", thread_id: session });
emit({ type: "turn.started" });
emit({ type: "item.completed", item: { type: "agent_message", phase: "commentary", text: "fixture progress" } });
emit({ type: "future.unknown_event", detail: "kept in raw log" });

if (scenario === "hang") {
  setInterval(() => {}, 1000);
} else {
  if (scenario === "delayed") await new Promise((resolve) => setTimeout(resolve, 300));
  emit({ type: "item.completed", item: { type: "command_execution", command: "fixture-check", exit_code: 0 } });
  emit({ type: "item.completed", item: { type: "file_change", changes: [{ path: path.join(process.cwd(), "example.mjs"), kind: "update" }] } });
  emit({ type: "item.completed", item: { type: "agent_message", phase: "final_answer", text: "event text is not the report" } });
  if (scenario !== "no-final") writeFileSync(output, "fixture final report\n");
  if (scenario === "failed-event") {
    emit({ type: "turn.failed", error: { message: "fixture turn failure" } });
  } else if (scenario !== "no-completion") {
    emit({ type: "turn.completed", usage: { input_tokens: 100, cached_input_tokens: 40, output_tokens: 9 } });
  }
  process.exitCode = scenario === "failed-exit" ? 7 : 0;
}
