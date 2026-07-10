// Minimal argv parser. spec: { flagName: "boolean" | "string" }.
// Returns { flags, positionals }. Unknown --flags throw so typos fail loudly.
export function parseArgs(argv, spec) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      const name = (eq === -1 ? arg.slice(2) : arg.slice(2, eq));
      const kind = spec[name];
      if (!kind) throw new UsageError(`unknown flag --${name}`);
      if (kind === "boolean") {
        if (eq !== -1) throw new UsageError(`--${name} takes no value`);
        flags[name] = true;
      } else {
        const value = eq !== -1 ? arg.slice(eq + 1) : argv[++i];
        if (value === undefined) throw new UsageError(`--${name} requires a value`);
        flags[name] = value;
      }
    } else {
      positionals.push(arg);
    }
  }
  return { flags, positionals };
}

export class UsageError extends Error {}
