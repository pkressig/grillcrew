import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(repoRoot, "ai", "generated");
const outputPath = path.join(outputDir, "CONTEXT_PACK.md");

const coreFiles = [
  "ai/MEMORY.md",
  "ai/STATUS.md",
  "ai/SESSION.md",
  "ai/CONTEXT.md",
  "ai/AGENTS.md",
];

const authoritativeDocs = [
  "CLAUDE.md",
  "CONTRIBUTING.md",
  "README.md",
  "docs/PRD.md",
  "docs/DECISIONS.md",
  "docs/FEATURES.md",
  "docs/ROADMAP.md",
  "docs/ARCHITECTURE.md",
  "docs/BUSINESS_RULES.md",
  "docs/DATA_MODEL.md",
  "docs/PERMISSIONS.md",
  "docs/BACKLOG.md",
  "docs/DEPLOYMENT.md",
];

const featurePlans = ["docs/F002_PLAN.md", "docs/F002_DECISIONS.md"];

function git(args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (result.error) {
    return `Git unavailable: ${result.error.message}`;
  }

  if (result.status !== 0) {
    return `Git command failed: git ${args.join(" ")}`;
  }

  return result.stdout.trim() || "(none)";
}

function readRelative(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8").trimEnd();
}

function existingList(paths) {
  return paths.filter((relativePath) => fs.existsSync(path.join(repoRoot, relativePath)));
}

function fencedFile(relativePath) {
  return [`## ${relativePath}`, "", "```markdown", readRelative(relativePath), "```"].join("\n");
}

function buildContextPack() {
  const timestamp = new Date().toISOString();
  const gitStatus = git(["status", "--short"]);
  const recentCommits = git(["log", "--oneline", "-10"]);
  const docs = existingList(authoritativeDocs);
  const plans = existingList(featurePlans);

  const sections = [
    "# Generated AI Context Pack",
    "",
    "Generated, non-authoritative snapshot. Repository source files remain authoritative.",
    "",
    `- Generated timestamp: ${timestamp}`,
    "",
    "# Included AI Core Files",
    "",
    ...coreFiles.map(fencedFile),
    "",
    "# Concise Git Status",
    "",
    "```text",
    gitStatus,
    "```",
    "",
    "# Recent Commit Summaries",
    "",
    "```text",
    recentCommits,
    "```",
    "",
    "# Authoritative Docs",
    "",
    ...docs.map((doc) => `- ${doc}`),
    "",
    "# Current Feature-Plan References",
    "",
    ...plans.map((plan) => `- ${plan}`),
    "",
    "# Embedded Authoritative Documents",
    "",
    "These documents are embedded so ChatGPT or another agent can regain project context even when repository connector access is unavailable. The repository files remain authoritative.",
    "",
    ...docs.map(fencedFile),
    "",
    "# Embedded Current Feature Plans",
    "",
    ...plans.map(fencedFile),
    "",
    "# Exclusions",
    "",
    "This generated pack intentionally excludes secrets, `.env` contents, tokens, passwords, application source-code dumps, Excel content, `node_modules`, virtual environments, caches, and build output.",
    "",
  ];

  return sections.join("\n");
}

try {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, buildContextPack(), "utf8");
  console.log("Generated ai/generated/CONTEXT_PACK.md.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
