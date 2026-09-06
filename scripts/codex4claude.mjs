#!/usr/bin/env node
import { UsageError } from "./lib/args.mjs";

const HELP = `codex4claude — submit tasks to Codex (gpt-6-astra) with persistent sessions

Usage: node codex4claude.mjs <command> [options]

Commands:
  doctor                              Check codex CLI >= 0.153.4, configured model, data dir
  run [PROMPT]                        Run a task (prompt: --prompt-file > PROMPT > stdin)
    --session <id>                    Resume a specific Codex session
    --write | --read-only | --dangerous   Permissions (default: read-only; choose one)
    --effort <low|medium|high|xhigh|max|ultra>
    --fast                            Request Fast mode (service_tier=priority, increased usage)
    --background                      Detached run, returns run id immediately
    --timeout <sec>                   Foreground/background timeout (default 540; 0 disables)
    --cd <dir>  --ephemeral  --prompt-file <path>
  status [<run-id>]                   List recent runs / inspect one
  result <run-id>                     Replay the report of a finished run
  log <run-id> [--tail N] [--grep P] [--type <event-type>]
  cancel <run-id>
`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case undefined:
    case "help":
    case "--help":
    case "-h":
      process.stdout.write(HELP);
      return 0;
    case "doctor":
      return (await import("./lib/doctor.mjs")).doctor();
    case "agent":
      throw new UsageError("agent commands were removed; submit tasks with run [PROMPT], resume with --session <id>");
    case "run":
      return (await import("./lib/run.mjs")).runCommand(rest);
    case "status":
    case "result":
    case "log":
    case "cancel":
      return (await import("./lib/background.mjs")).jobCommand(cmd, rest);
    case "run-worker": // internal: detached background worker entry
      return (await import("./lib/background.mjs")).runWorker(rest);
    default:
      throw new UsageError(`unknown command "${cmd}" (see: codex4claude.mjs help)`);
  }
}

main()
  .then((code) => process.exit(code ?? 0))
  .catch((err) => {
    if (err instanceof UsageError) {
      process.stderr.write(`usage error: ${err.message}\n`);
      process.exit(2);
    }
    process.stderr.write(`error: ${err?.stack ?? err}\n`);
    process.exit(1);
  });
