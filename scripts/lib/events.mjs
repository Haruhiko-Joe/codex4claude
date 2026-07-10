// Tolerant collector over `codex exec --json` JSONL events.
// Verified against codex-cli 0.144.0:
//   {"type":"thread.started","thread_id":"…"}
//   {"type":"item.completed","item":{"type":"agent_message","text":"…"}}
//   {"type":"turn.completed","usage":{"input_tokens":…,"cached_input_tokens":…,"output_tokens":…}}
// Unknown event/item types are ignored so CLI upgrades degrade gracefully.

export function createEventCollector() {
  const data = {
    sessionId: null,
    lastAgentMessage: null,
    files: new Map(), // path -> kind
    commands: [],
    usage: { input: 0, cached: 0, output: 0 },
    errors: [],
  };

  function onItem(item) {
    switch (item?.type) {
      case "agent_message":
        if (typeof item.text === "string") data.lastAgentMessage = item.text;
        break;
      case "file_change": {
        const changes = item.changes ?? item.files ?? [];
        for (const c of changes) {
          if (c?.path) data.files.set(c.path, c.kind ?? c.change ?? "update");
        }
        break;
      }
      case "command_execution": {
        const command = item.command ?? item.cmd;
        if (command) {
          data.commands.push({ command, exit: item.exit_code ?? item.exitCode ?? null });
        }
        break;
      }
      case "error":
        if (item.message) data.errors.push(String(item.message));
        break;
      default:
        break;
    }
  }

  return {
    data,
    line(line) {
      let ev;
      try {
        ev = JSON.parse(line);
      } catch {
        return;
      }
      switch (ev?.type) {
        case "thread.started":
          if (ev.thread_id) data.sessionId = ev.thread_id;
          break;
        case "item.completed":
          onItem(ev.item);
          break;
        case "turn.completed": {
          const u = ev.usage ?? {};
          data.usage.input += u.input_tokens ?? 0;
          data.usage.cached += u.cached_input_tokens ?? 0;
          data.usage.output += u.output_tokens ?? 0;
          break;
        }
        case "turn.failed":
        case "error":
          data.errors.push(ev.message ?? ev.error?.message ?? JSON.stringify(ev));
          break;
        default:
          break;
      }
    },
  };
}
