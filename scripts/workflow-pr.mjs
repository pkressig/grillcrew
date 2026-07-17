import {
  fail,
  getDiffStatAgainstMain,
  getGitSnapshot,
  parseOptions,
  relativePath,
  verifyGitAvailable,
  writeGeneratedFile,
} from "./workflow-utils.mjs";

const { values } = parseOptions(process.argv.slice(2));

if (values.length !== 1) {
  fail('Usage: npm.cmd run workflow:pr -- "<PR_TITLE>"');
}

const [title] = values;

try {
  verifyGitAvailable();
  const snapshot = getGitSnapshot();
  const diffStat = getDiffStatAgainstMain();

  const body = [
    "# Pull Request Description",
    "",
    "## Summary",
    "",
    `- ${title}`,
    `- Branch: \`${snapshot.branch}\``,
    `- Latest commit: \`${snapshot.shortCommit}\` - ${snapshot.subject}`,
    "",
    "## Validation Checklist",
    "",
    "- [ ] `npm.cmd run ai:prepare`",
    "- [ ] `npm.cmd run check`",
    "- [ ] `git diff --check`",
    "- [ ] CI is green before merge",
    "",
    "## Product Scope",
    "",
    "- Confirm this PR stays within the approved feature or repository/process scope.",
    "- Confirm no deferred product behavior was added without Product Owner approval.",
    "",
    "## Docs Impact",
    "",
    "- Document changed docs or state `None`.",
    "",
    "## Database / Migration Impact",
    "",
    "- State whether database models, migrations, seed data, or tenant-scoped data changed.",
    "",
    "## Deployment Considerations",
    "",
    "- State whether Render, Vercel, environment variables, build commands, or production runtime behavior changed.",
    "",
    "## Intentionally Deferred Work",
    "",
    "- List deferred follow-up work or state `None`.",
    "",
    "## Diff Stat Against Main",
    "",
    "```text",
    diffStat,
    "```",
    "",
    "Do not commit or push from this generated description.",
    "",
  ].join("\n");

  const outputPath = writeGeneratedFile("pr-description.md", body);
  console.log(`Generated ${relativePath(outputPath)}.`);
  console.log("");
  console.log(`Suggested PR title: ${title}`);
  console.log("Product Owner: open the PR manually and paste ai/generated/pr-description.md into the description.");
} catch (error) {
  fail(error instanceof Error ? error.message : String(error), 1);
}
