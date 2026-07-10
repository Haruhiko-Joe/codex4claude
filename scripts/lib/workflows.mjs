import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { UsageError } from "./args.mjs";
import { parseFrontmatter } from "./frontmatter.mjs";
import { builtinWorkflowsDir, projectWorkflowsDir, userWorkflowsDir } from "./paths.mjs";

function layers(cwd) {
  return [
    { source: "project", dir: projectWorkflowsDir(cwd) },
    { source: "user", dir: userWorkflowsDir() },
    { source: "builtin", dir: builtinWorkflowsDir() },
  ];
}

export async function workflowCommand(argv) {
  const [sub, name] = argv;
  const cwd = process.cwd();
  switch (sub) {
    case "list": {
      const seen = new Map();
      for (const { source, dir } of layers(cwd)) {
        if (!existsSync(dir)) continue;
        for (const entry of readdirSync(dir)) {
          if (!entry.endsWith(".md")) continue;
          const wfName = entry.slice(0, -3);
          if (seen.has(wfName)) continue;
          const { meta } = parseFrontmatter(readFileSync(path.join(dir, entry), "utf8"));
          seen.set(wfName, { name: wfName, source, description: meta.description ?? "" });
        }
      }
      if (seen.size === 0) {
        process.stdout.write("no workflows found\n");
        return 0;
      }
      for (const w of [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))) {
        process.stdout.write(`${w.name.padEnd(20)} [${w.source.padEnd(7)}] ${w.description}\n`);
      }
      return 0;
    }
    case "show": {
      if (!name) throw new UsageError("workflow show <name>");
      for (const { source, dir } of layers(cwd)) {
        const file = path.join(dir, `${name}.md`);
        if (existsSync(file)) {
          process.stdout.write(`# source: ${source} (${file})\n\n${readFileSync(file, "utf8")}`);
          return 0;
        }
      }
      throw new UsageError(`workflow "${name}" not found`);
    }
    default:
      throw new UsageError("workflow <list|show> …");
  }
}
