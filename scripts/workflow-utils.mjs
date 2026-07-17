import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const generatedDir = path.join(repoRoot, "ai", "generated");

export function fail(message, code = 2) {
  console.error(message);
  process.exit(code);
}

export function relativePath(absolutePath) {
  return path.relative(repoRoot, absolutePath).replace(/\\/g, "/");
}

export function ensureGeneratedDir() {
  fs.mkdirSync(generatedDir, { recursive: true });
}

export function readRepoFile(relativeFilePath) {
  return fs.readFileSync(path.join(repoRoot, relativeFilePath), "utf8");
}

export function writeGeneratedFile(filename, body) {
  ensureGeneratedDir();
  const outputPath = path.join(generatedDir, filename);
  fs.writeFileSync(outputPath, body, "utf8");
  return outputPath;
}

export function resolveInsideRepo(relativeOrAbsolutePath) {
  const resolved = path.resolve(repoRoot, relativeOrAbsolutePath);
  const relative = path.relative(repoRoot, resolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path must be inside the repository.");
  }

  return resolved;
}

export function git(args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    ...options,
  });

  if (result.error) {
    throw new Error(`Git is unavailable: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(`Git command failed: git ${args.join(" ")}${detail ? `\n${detail}` : ""}`);
  }

  return {
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

export function verifyGitAvailable() {
  git(["--version"]);
}

export function getGitSnapshot() {
  const branch = git(["branch", "--show-current"]).stdout || "(detached HEAD)";
  const commit = git(["rev-parse", "HEAD"]).stdout;
  const shortCommit = git(["rev-parse", "--short", "HEAD"]).stdout;
  const subject = git(["log", "-1", "--pretty=format:%s"]).stdout;
  const status = git(["status", "--porcelain"]).stdout;
  const changedPaths = status ? status.split(/\r?\n/).filter(Boolean).map((line) => line.trim()) : [];

  return {
    branch,
    commit,
    shortCommit,
    subject,
    status,
    changedPaths,
    state: changedPaths.length === 0 ? "clean" : `dirty (${changedPaths.length} changed path(s))`,
  };
}

export function getDiffStatAgainstMain() {
  try {
    return git(["diff", "--stat", "main...HEAD"]).stdout || "(no diff against main)";
  } catch {
    try {
      return git(["diff", "--stat", "main"]).stdout || "(no diff against main)";
    } catch {
      return "Main branch comparison unavailable.";
    }
  }
}

export function parseOptions(args) {
  const values = [];
  const options = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--update-session") {
      options.updateSession = true;
      continue;
    }

    if (arg === "--type") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        fail("Missing value for --type.");
      }
      options.type = value.toLowerCase();
      index += 1;
      continue;
    }

    if (arg.startsWith("--type=")) {
      options.type = arg.slice("--type=".length).toLowerCase();
      continue;
    }

    values.push(arg);
  }

  return { values, options };
}

export function defaultFilesToRead(featureId) {
  const candidates = [
    "CLAUDE.md",
    "CONTRIBUTING.md",
    "README.md",
    "ai/AGENTS.md",
    "ai/MEMORY.md",
    "ai/STATUS.md",
    "ai/SESSION.md",
    "ai/CONTEXT.md",
    "ai/REVIEW.md",
    "docs/PRD.md",
    "docs/DECISIONS.md",
    "docs/FEATURES.md",
    "docs/ROADMAP.md",
    "docs/ARCHITECTURE.md",
    "docs/BUSINESS_RULES.md",
    "docs/DATA_MODEL.md",
    "docs/PERMISSIONS.md",
    "docs/BACKLOG.md",
    `docs/${featureId}_PLAN.md`,
    `docs/${featureId}_DECISIONS.md`,
  ];

  return candidates.filter((candidate) => fs.existsSync(path.join(repoRoot, candidate))).join(", ");
}

export function fillTemplate(template, values) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      return values[key];
    }
    return match;
  });
}

export function buildTemplateValues({
  featureId,
  featureName,
  step,
  branch,
  scope,
  acceptanceCriteria,
  filesToRead,
  knownRisks,
}) {
  return {
    FEATURE_ID: featureId,
    FEATURE_NAME: featureName,
    STEP: step || featureName,
    BRANCH: branch,
    SCOPE:
      scope ||
      "Stay within the approved repository/process task. Do not change product functionality or runtime behavior.",
    ACCEPTANCE_CRITERIA:
      acceptanceCriteria ||
      "Generated workflow artifact matches the requested scope; no automatic branch, commit, push, PR, merge, external AI invocation, or destructive Git operation is performed.",
    FILES_TO_READ: filesToRead || defaultFilesToRead(featureId),
    KNOWN_RISKS:
      knownRisks ||
      "Generated prompts are guidance only. The repository remains the source of truth and the Product Owner controls commits, pushes, PRs, and merges.",
  };
}

export function appendNoCommitRule(body) {
  if (body.toLowerCase().includes("do not commit or push")) {
    return body;
  }

  return `${body.trimEnd()}\n\n## Safety Reminder\n\n- Do not commit or push.\n`;
}

export function updateSession(body) {
  fs.writeFileSync(path.join(repoRoot, "ai", "SESSION.md"), body, "utf8");
}

export function assertMarkdownPathInsideRepo(source) {
  const resolved = resolveInsideRepo(source);

  if (path.extname(resolved).toLowerCase() !== ".md") {
    throw new Error("Source must be a Markdown file.");
  }

  if (!fs.existsSync(resolved)) {
    throw new Error(`Source file not found: ${source}`);
  }

  return resolved;
}

export function assertNoObviousSecrets(content) {
  const secretPattern = /^\s*(?:[A-Z0-9_]*SECRET|[A-Z0-9_]*TOKEN|[A-Z0-9_]*PASSWORD|API[_-]?KEY)\s*[:=]\s*\S+/gim;

  if (secretPattern.test(content)) {
    throw new Error("Source appears to contain secret-like key/value material. Refusing to create report.");
  }
}

export function printGitSnapshot(snapshot) {
  console.log(`Current branch: ${snapshot.branch}`);
  console.log(`Current commit: ${snapshot.commit}`);
  console.log(`Working tree state: ${snapshot.state}`);

  if (snapshot.changedPaths.length > 0) {
    console.log("");
    console.log("WARNING: Working tree is dirty. Review these paths before committing:");
    for (const changedPath of snapshot.changedPaths) {
      console.log(`- ${changedPath}`);
    }
  }
}

