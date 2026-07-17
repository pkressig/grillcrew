import { spawnSync } from "node:child_process";
import fs from "node:fs";
import {
  assertMarkdownPathInsideRepo,
  assertNoObviousSecrets,
  fail,
  getGitSnapshot,
  relativePath,
  repoRoot,
  updateSession,
  verifyGitAvailable,
} from "./workflow-utils.mjs";

const args = process.argv.slice(2);

if (args.length !== 3) {
  fail("Usage: npm.cmd run workflow:handoff -- <agent> <feature> <source.md>");
}

const [agent, feature, source] = args;

try {
  verifyGitAvailable();
  const sourcePath = assertMarkdownPathInsideRepo(source);
  const sourceBody = fs.readFileSync(sourcePath, "utf8");
  assertNoObviousSecrets(sourceBody);

  const result = spawnSync(process.execPath, ["scripts/create-ai-report.mjs", agent, feature, source], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (result.error) {
    throw new Error(`Report creation failed: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(detail || "Report creation failed.");
  }

  const reportPath = result.stdout.trim().replace(/\\/g, "/");
  const snapshot = getGitSnapshot();

  updateSession(
    [
      "# Latest AI Handoff",
      "",
      `- Completed work: Created immutable handoff report for ${feature}.`,
      `- Files or areas changed: \`${reportPath}\` and \`ai/SESSION.md\`.`,
      `- Source handoff: \`${relativePath(sourcePath)}\`.`,
      `- Branch: \`${snapshot.branch}\`.`,
      `- Commit: \`${snapshot.commit}\`.`,
      "- Next exact action: Product Owner reviews the report and decides whether to commit, push, open a PR, request review, or continue implementation.",
      "- Responsible next agent: Product Owner.",
      "- Commit or uncommitted state: Report and session update only; do not commit or push unless explicitly ordered.",
      `- Timestamp: ${new Date().toISOString()}.`,
      "",
    ].join("\n"),
  );

  console.log(`Created ${reportPath}.`);
  console.log("Updated ai/SESSION.md.");
  console.log("Do not commit or push unless the Product Owner explicitly decides to do so.");
} catch (error) {
  fail(error instanceof Error ? error.message : String(error), 1);
}


