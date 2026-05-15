import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["app/(app)/brief", "components/brief", "content/brief"];
const forbidden = [
  "DeepSeek",
  "OpenAI",
  "Vercel",
  "FINNHUB",
  "NEWS_API",
  "deepseek",
  "openai",
  "anthropic",
  "claude",
  "static_watchlist",
  "config window",
];
const allowedExtensions = new Set([".ts", ".tsx", ".md", ".mdx", ".json"]);

function walk(root) {
  const rows = [];
  for (const name of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, name.name);
    if (name.isDirectory()) rows.push(...walk(path));
    else if (allowedExtensions.has(path.slice(path.lastIndexOf(".")))) rows.push(path);
  }
  return rows;
}

const failures = [];
for (const root of roots) {
  try {
    if (!statSync(root).isDirectory()) continue;
  } catch {
    continue;
  }
  for (const file of walk(root)) {
    const text = readFileSync(file, "utf8");
    for (const token of forbidden) {
      if (text.includes(token)) failures.push(`${file}: contains ${token}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Forbidden public /brief copy found:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Brief public copy check passed.");
