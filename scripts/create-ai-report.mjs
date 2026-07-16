import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportsDir = path.join(repoRoot, "ai", "reports");
const templatePath = path.join(repoRoot, "ai", "REPORT_TEMPLATE.md");

const [, , agent, feature, source] = process.argv;

function usage() {
  console.error("Usage: node scripts/create-ai-report.mjs <agent> <feature> [source.md]");
  process.exit(2);
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function timestampForFilename(date) {
  const pad = (number) => String(number).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + `-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function resolveSourcePath(sourcePath) {
  const resolved = path.resolve(repoRoot, sourcePath);
  const relative = path.relative(repoRoot, resolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Report source must be inside the repository.");
  }

  if (path.extname(resolved).toLowerCase() !== ".md") {
    throw new Error("Report source must be a Markdown file.");
  }

  return resolved;
}

if (!agent || !feature) {
  usage();
}

try {
  fs.mkdirSync(reportsDir, { recursive: true });

  const filename = `${timestampForFilename(new Date())}-${slug(agent)}-${slug(feature)}.md`;
  const targetPath = path.join(reportsDir, filename);

  if (fs.existsSync(targetPath)) {
    throw new Error(`Report already exists: ${path.relative(repoRoot, targetPath)}`);
  }

  let body;
  if (source) {
    const sourcePath = resolveSourcePath(source);
    body = fs.readFileSync(sourcePath, "utf8");
  } else {
    body = fs.readFileSync(templatePath, "utf8");
  }

  fs.writeFileSync(targetPath, body, "utf8");
  console.log(path.relative(repoRoot, targetPath));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
