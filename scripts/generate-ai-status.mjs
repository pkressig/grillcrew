import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const statusPath = path.join(repoRoot, "ai", "STATUS.md");
const startMarker = "<!-- GENERATED:START -->";
const endMarker = "<!-- GENERATED:END -->";

function git(args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
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

function readGitStatus() {
  const branch = git(["branch", "--show-current"]).stdout || "(detached HEAD)";
  const commit = git(["rev-parse", "HEAD"]).stdout;
  const subject = git(["log", "-1", "--pretty=format:%s"]).stdout;
  const status = git(["status", "--porcelain"]).stdout;
  const state = status ? `dirty (${status.split(/\r?\n/).length} changed path(s))` : "clean";

  return { branch, commit, subject, state };
}

function updateStatusFile(generated) {
  const existing = fs.readFileSync(statusPath, "utf8");
  const start = existing.indexOf(startMarker);
  const end = existing.indexOf(endMarker);

  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Missing generated markers in ${path.relative(repoRoot, statusPath)}`);
  }

  const before = existing.slice(0, start + startMarker.length);
  const after = existing.slice(end);
  fs.writeFileSync(statusPath, `${before}\n${generated}\n${after}`, "utf8");
}

try {
  const gitStatus = readGitStatus();
  const timestamp = new Date().toISOString();
  const generated = [
    `- Current branch: ${gitStatus.branch}`,
    `- Current commit: ${gitStatus.commit}`,
    `- Working tree state: ${gitStatus.state}`,
    `- Latest commit subject: ${gitStatus.subject}`,
    `- Latest update timestamp: ${timestamp}`,
  ].join("\n");

  updateStatusFile(generated);
  console.log("Updated ai/STATUS.md generated section.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
