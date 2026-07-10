#!/usr/bin/env node
import { UsageError } from "./lib/args.mjs";

const HELP = `codex4claude — delegate work to Codex (gpt-5.6-sol) as persistent agents

Usage: node codex4claude.mjs <command> [options]

Commands:
  doctor                              Check codex CLI, data dir, config
  agent define <name> [--project] [--file <md>]   Define/update an agent (stdin if no --file)
  agent list | show <name> | rm <name> [--project]
  run <agent> [PROMPT]                Run a task (prompt: --prompt-file > stdin > argument)
    --continue | --session <id>      Resume the agent's last / a specific session
    --write | --read-only | --dangerous   Sandbox override
    --effort <minimal|low|medium|high|xhigh>
    --background                      Detached run, returns run id immediately
    --timeout <sec>                   Foreground timeout (default 540)
    --cd <dir>  --ephemeral  --prompt-file <path>
  status [<run-id>]                   List recent runs / inspect one
  result <run-id>                     Replay the report of a finished run
  log <run-id> [--tail N] [--grep P] [--type <event-type>]
  cancel <run-id>
  workflow list | show <name>
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
      return (await import("./lib/agents.mjs")).agentCommand(rest);
    case "run":
      return (await import("./lib/run.mjs")).runCommand(rest);
    case "status":
    case "result":
    case "log":
    case "cancel":
      return (await import("./lib/background.mjs")).jobCommand(cmd, rest);
    case "run-worker": // internal: detached background worker entry
      return (await import("./lib/background.mjs")).runWorker(rest);
    case "workflow":
      return (await import("./lib/workflows.mjs")).workflowCommand(rest);
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
