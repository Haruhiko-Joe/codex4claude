import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs, UsageError } from "./args.mjs";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter.mjs";
import {
  builtinAgentsDir,
  ensureDir,
  projectAgentsDir,
  userAgentsDir,
} from "./paths.mjs";

export const SANDBOXES = ["read-only", "workspace-write", "danger-full-access"];
export const EFFORTS = ["minimal", "low", "medium", "high", "xhigh"];
const NAME_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;

function layers(cwd) {
  return [
    { source: "project", dir: projectAgentsDir(cwd) },
    { source: "user", dir: userAgentsDir() },
    { source: "builtin", dir: builtinAgentsDir() },
  ];
}

export function resolveAgent(name, cwd = process.cwd()) {
  for (const { source, dir } of layers(cwd)) {
    const file = path.join(dir, `${name}.md`);
    if (!existsSync(file)) continue;
    const { meta, body } = parseFrontmatter(readFileSync(file, "utf8"));
    return {
      name,
      description: meta.description ?? "",
      sandbox: meta.sandbox && SANDBOXES.includes(meta.sandbox) ? meta.sandbox : "read-only",
      effort: meta.effort && EFFORTS.includes(meta.effort) ? meta.effort : undefined,
      instructions: body.trim(),
      source,
      path: file,
    };
  }
  return null;
}

function listAgents(cwd) {
  const seen = new Map();
  for (const { source, dir } of layers(cwd)) {
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith(".md")) continue;
      const name = entry.slice(0, -3);
      if (seen.has(name)) continue;
      const { meta } = parseFrontmatter(readFileSync(path.join(dir, entry), "utf8"));
      seen.set(name, { name, source, description: meta.description ?? "" });
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function agentCommand(argv) {
  const [sub, ...rest] = argv;
  const cwd = process.cwd();
  switch (sub) {
    case "define": {
      const { flags, positionals } = parseArgs(rest, { project: "boolean", file: "string" });
      const name = positionals[0];
      if (!name || !NAME_RE.test(name)) {
        throw new UsageError(`agent name must match ${NAME_RE} (got "${name ?? ""}")`);
      }
      const raw = flags.file ? readFileSync(flags.file, "utf8") : readFileSync(0, "utf8");
      const { meta, body } = parseFrontmatter(raw);
      if (!body.trim()) throw new UsageError("agent definition body (system prompt) is empty");
      if (meta.sandbox && !SANDBOXES.includes(meta.sandbox)) {
        throw new UsageError(`sandbox must be one of: ${SANDBOXES.join(", ")}`);
      }
      if (meta.effort && !EFFORTS.includes(meta.effort)) {
        throw new UsageError(`effort must be one of: ${EFFORTS.join(", ")}`);
      }
      const dir = ensureDir(flags.project ? projectAgentsDir(cwd) : userAgentsDir());
      const file = path.join(dir, `${name}.md`);
      const scope = flags.project ? "project" : "user";
      writeFileSync(
        file,
        serializeFrontmatter(
          { name, description: meta.description, sandbox: meta.sandbox, effort: meta.effort },
          body
        )
      );
      process.stdout.write(`defined agent "${name}" [${scope}] → ${file}\n`);
      return 0;
    }
    case "list": {
      const agents = listAgents(cwd);
      if (agents.length === 0) {
        process.stdout.write("no agents found\n");
        return 0;
      }
      for (const a of agents) {
        process.stdout.write(`${a.name.padEnd(20)} [${a.source.padEnd(7)}] ${a.description}\n`);
      }
      return 0;
    }
    case "show": {
      const name = rest[0];
      if (!name) throw new UsageError("agent show <name>");
      const agent = resolveAgent(name, cwd);
      if (!agent) throw new UsageError(`agent "${name}" not found`);
      process.stdout.write(`# source: ${agent.source} (${agent.path})\n\n`);
      process.stdout.write(readFileSync(agent.path, "utf8"));
      return 0;
    }
    case "rm": {
      const { flags, positionals } = parseArgs(rest, { project: "boolean" });
      const name = positionals[0];
      if (!name) throw new UsageError("agent rm <name> [--project]");
      const dir = flags.project ? projectAgentsDir(cwd) : userAgentsDir();
      const file = path.join(dir, `${name}.md`);
      if (!existsSync(file)) {
        throw new UsageError(
          `agent "${name}" not found in ${flags.project ? "project" : "user"} scope (builtin agents cannot be removed)`
        );
      }
      unlinkSync(file);
      process.stdout.write(`removed agent "${name}" (${file})\n`);
      return 0;
    }
    default:
      throw new UsageError("agent <define|list|show|rm> …");
  }
}
