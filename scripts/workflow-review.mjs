import {
  appendNoCommitRule,
  buildTemplateValues,
  fail,
  fillTemplate,
  getGitSnapshot,
  parseOptions,
  readRepoFile,
  relativePath,
  verifyGitAvailable,
  writeGeneratedFile,
} from "./workflow-utils.mjs";

const reviewers = new Set(["claude", "codex", "agy", "chatgpt"]);
const securityKeywords = /\b(auth|permission|csrf|token|password|migration|tenant|platform)\b/i;
const { values, options } = parseOptions(process.argv.slice(2));

if (values.length !== 3) {
  fail('Usage: npm.cmd run workflow:review -- <claude|codex|agy|chatgpt> <FEATURE_ID> "<FEATURE_NAME>" [--type code|security|ux|research]');
}

const [reviewer, featureId, featureName] = values;

if (!reviewers.has(reviewer)) {
  fail("Reviewer must be one of: claude, codex, agy, chatgpt.");
}

function chooseTemplate() {
  if (reviewer === "agy") {
    return options.type === "research" ? "prompts/research.md" : "prompts/ux-review.md";
  }

  if (reviewer === "chatgpt") {
    return null;
  }

  if (options.type === "security") {
    return "prompts/security-review.md";
  }

  if (options.type === "code") {
    return "prompts/code-review.md";
  }

  return securityKeywords.test(`${featureId} ${featureName}`)
    ? "prompts/security-review.md"
    : "prompts/code-review.md";
}

function chatGptPrompt(snapshot) {
  return [
    "# CTO Review Handoff",
    "",
    "Role: ChatGPT, CTO and product orchestrator.",
    "",
    "## Assignment",
    "",
    `- Feature ID: \`${featureId}\``,
    `- Feature name: \`${featureName}\``,
    `- Branch: \`${snapshot.branch}\``,
    `- Commit: \`${snapshot.commit}\``,
    "",
    "## Required Reading",
    "",
    "- Read `ai/generated/CONTEXT_PACK.md` first.",
    "- Then inspect the current PR or branch diff in GitHub when connector access is available.",
    "- Relevant repository files are listed in `ai/CONTEXT.md`; start with `CLAUDE.md`, `CONTRIBUTING.md`, `README.md`, and the `ai/` core files.",
    "",
    "## Review Focus",
    "",
    "- Confirm scope and product direction.",
    "- Identify architecture, security, documentation, delivery, or review gaps.",
    "- Keep recommendations as proposals until Product Owner approval.",
    "- Do not directly modify the repository.",
    "- Do not commit or push.",
    "",
  ].join("\n");
}

function applyReviewerRole(filledTemplate) {
  if (reviewer !== "codex") {
    return filledTemplate;
  }

  return filledTemplate.replace(/^Role: Claude Code,/m, "Role: Codex,");
}

try {
  verifyGitAvailable();
  const snapshot = getGitSnapshot();
  const templatePath = chooseTemplate();
  const body = templatePath
    ? appendNoCommitRule(
        applyReviewerRole(
          fillTemplate(
            readRepoFile(templatePath),
            buildTemplateValues({
              featureId,
              featureName,
              branch: snapshot.branch,
            }),
          ),
        ),
      )
    : chatGptPrompt(snapshot);

  const outputPath = writeGeneratedFile("current-review.md", body);
  console.log(`Generated ${relativePath(outputPath)}.`);
  console.log("");

  if (reviewer === "claude") {
    console.log("Next command for the Product Owner:");
    console.log("claude");
    console.log("Then tell Claude Code: Read ai/generated/current-review.md and execute the review. Do not commit or push.");
  } else if (reviewer === "agy") {
    console.log("Next command for the Product Owner:");
    console.log("agy");
    console.log("Then tell AGY / Antigravity: Read ai/generated/current-review.md and execute the review. Do not commit or push.");
  } else if (reviewer === "codex") {
    console.log("Next command for the Product Owner:");
    console.log("codex");
    console.log("Then tell Codex: Read ai/generated/current-review.md and execute the review. Do not commit or push.");
  } else {
    console.log("Next instruction for the Product Owner:");
    console.log("Open ChatGPT with ai/generated/CONTEXT_PACK.md and paste ai/generated/current-review.md. Do not ask ChatGPT to commit or push.");
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error), 1);
}
