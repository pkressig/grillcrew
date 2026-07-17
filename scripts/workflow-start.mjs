import {
  appendNoCommitRule,
  buildTemplateValues,
  fail,
  fillTemplate,
  getGitSnapshot,
  parseOptions,
  printGitSnapshot,
  readRepoFile,
  relativePath,
  updateSession,
  verifyGitAvailable,
  writeGeneratedFile,
} from "./workflow-utils.mjs";

const { values, options } = parseOptions(process.argv.slice(2));

if (values.length !== 3) {
  fail('Usage: npm.cmd run workflow:start -- <FEATURE_ID> "<FEATURE_NAME>" <BRANCH> [--update-session]');
}

const [featureId, featureName, branch] = values;

try {
  verifyGitAvailable();
  const snapshot = getGitSnapshot();
  printGitSnapshot(snapshot);

  const template = readRepoFile("prompts/implement.md");
  const task = appendNoCommitRule(
    fillTemplate(
      template,
      buildTemplateValues({
        featureId,
        featureName,
        branch,
      }),
    ),
  );

  const outputPath = writeGeneratedFile("current-task.md", task);
  console.log("");
  console.log(`Generated ${relativePath(outputPath)}.`);

  console.warn("workflow:start creates a generic scaffold. For product features, prefer a ChatGPT-authored ai/generated/current-task.md and review this file before Codex executes it.");

  if (options.updateSession) {
    updateSession(
      [
        "# Latest AI Handoff",
        "",
        `- Completed work: Prepared workflow task prompt for ${featureId} - ${featureName}.`,
        `- Files or areas changed: \`${relativePath(outputPath)}\`${snapshot.changedPaths.length > 0 ? ", plus existing dirty worktree paths." : "."}`,
        `- Branch expected: \`${branch}\`.`,
        "- Next exact action: Start Codex from the repository root and tell Codex to read `ai/generated/current-task.md` and execute it.",
        "- Responsible next agent: Product Owner / Codex.",
        "- Commit or uncommitted state: Generated prompt only; do not commit or push.",
        `- Timestamp: ${new Date().toISOString()}.`,
        "",
      ].join("\n"),
    );
    console.log("Updated ai/SESSION.md.");
  }

  console.log("");
  console.log("Next command for the Product Owner:");
  console.log("codex");
  console.log("Then tell Codex: Read ai/generated/current-task.md and execute it. Do not commit or push.");
} catch (error) {
  fail(error instanceof Error ? error.message : String(error), 1);
}
