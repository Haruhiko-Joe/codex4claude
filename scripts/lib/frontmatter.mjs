// Minimal frontmatter codec for files this plugin writes itself.
// Supports scalar string values only — enough for agent/workflow metadata.

export function parseFrontmatter(text) {
  if (!text.startsWith("---\n")) return { meta: {}, body: text };
  const end = text.indexOf("\n---", 4);
  if (end === -1) return { meta: {}, body: text };
  const meta = {};
  for (const line of text.slice(4, end).split("\n")) {
    const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    meta[m[1]] = value;
  }
  const body = text.slice(end + 4).replace(/^\n/, "");
  return { meta, body };
}

export function serializeFrontmatter(meta, body) {
  const lines = Object.entries(meta)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}: ${String(v)}`);
  return `---\n${lines.join("\n")}\n---\n\n${body.trimStart()}`;
}
