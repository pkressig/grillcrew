import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const env = process.env;
const api = (env.PAPERCLIP_API_URL || "").replace(/\/$/, "");
const key = env.PAPERCLIP_API_KEY;
const companyId = env.PAPERCLIP_COMPANY_ID;
const agentId = env.PAPERCLIP_AGENT_ID;
const runId = env.PAPERCLIP_RUN_ID;
const preferredIssueId = env.PAPERCLIP_TASK_ID;

if (!api || !key || !companyId || !agentId || !runId) {
  throw new Error("Missing Paperclip runtime context");
}

const request = async (path, options = {}) => {
  const response = await fetch(`${api}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "X-Paperclip-Run-Id": runId,
      ...(options.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`Paperclip ${response.status}: ${await response.text()}`);
  return response.status === 204 ? null : response.json();
};

const git = (args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
const read = (path) => readFileSync(resolve(path), "utf8");

const listResponse = await request(
  `/api/companies/${companyId}/issues?assigneeAgentId=${agentId}&status=todo,in_progress,in_review,blocked`,
);
const issues = Array.isArray(listResponse) ? listResponse : listResponse.value || [];
const issue =
  issues.find((candidate) => candidate.id === preferredIssueId) ||
  issues.find((candidate) => candidate.status === "in_review") ||
  issues.find((candidate) => candidate.status === "in_progress") ||
  issues.find((candidate) => candidate.status === "todo") ||
  issues[0];

if (!issue) throw new Error("No assigned active review issue");

await request(`/api/issues/${issue.id}/checkout`, {
  method: "POST",
  body: JSON.stringify({
    agentId,
    expectedStatuses: ["todo", "in_progress", "in_review", "blocked"],
  }),
});

const detail = await request(`/api/issues/${issue.id}`);
const commentsResponse = await request(`/api/issues/${issue.id}/comments`);
const comments = Array.isArray(commentsResponse) ? commentsResponse : commentsResponse.value || [];

let diff = "";
try {
  diff = git(["diff", "--no-ext-diff", "main...HEAD"]);
} catch {}
try {
  diff += git(["diff", "--no-ext-diff"]);
} catch {}
if (!diff.trim()) {
  try {
    diff = git(["show", "--format=fuller", "--no-ext-diff", "HEAD"]);
  } catch (error) {
    diff = String(error.stdout || error.message);
  }
}

const featurePlans = readdirSync(resolve("docs"))
  .filter((name) => /^F\d+_PLAN\.md$/.test(name))
  .map((name) => `docs/${name}`);
const sources = [
  "ai/OPERATING_MODEL.md",
  "docs/PRD.md",
  "docs/DECISIONS.md",
  "docs/FEATURES.md",
  "docs/BUSINESS_RULES.md",
  "docs/PERMISSIONS.md",
  "docs/UX_UI.md",
  "ai/REVIEW.md",
  "paperclip/company-template/skills/grillcrew-product-review/SKILL.md",
  ...featurePlans,
].map((path) => `\n\n===== ${path} =====\n${read(path)}`).join("");

const packet = `You are the independent GrillCrew product, UX, accessibility, workflow, privacy,
German-copy, and market reviewer. Follow the supplied grillcrew-product-review instructions.
Analyze only this packet. Do not use tools, commands, file access, browsing, or external context.

Return concise Markdown. The first non-heading line must be exactly either:
DECISION: APPROVED
or
DECISION: CHANGES_REQUESTED

ASSIGNED ISSUE
${JSON.stringify({
  identifier: detail.identifier,
  title: detail.title,
  description: detail.description,
  ancestors: detail.ancestors,
}, null, 2)}

ISSUE COMMENTS
${JSON.stringify(comments.map(({ body, createdAt }) => ({ body, createdAt })), null, 2)}

PROJECT SOURCES
${sources}

REPOSITORY CHANGESET
${diff}`;

const scratchDir = env.PAPERCLIP_RUN_SCRATCH_DIR || env.PAPERCLIP_SCRATCH_DIR;
if (!scratchDir) throw new Error("Missing Paperclip scratch directory");
writeFileSync(resolve(scratchDir, "grillcrew-review-packet.md"), packet, "utf8");
const prompt = `Read grillcrew-review-packet.md from the current directory, then perform exactly the
independent review requested inside it. Treat that file as the complete and only evidence packet. Do not
inspect any other file, directory, repository, network source, or external context. Return the required
DECISION sentinel and concise Markdown review.`;

const output = execFileSync(
  "C:\\Users\\pkres\\AppData\\Local\\agy\\bin\\agy.exe",
  [
    "--effort",
    "high",
    "--mode",
    "plan",
    "--sandbox",
    "--dangerously-skip-permissions",
    "--print",
    prompt,
    "--print-timeout",
    "25m",
  ],
  {
    cwd: scratchDir,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    timeout: 30 * 60 * 1000,
  },
).trim();

if (!output) throw new Error("AGY returned no output");
const changesRequested = /(^|\n)DECISION:\s*CHANGES_REQUESTED\s*($|\n)/i.test(output);
if (!changesRequested && !/(^|\n)DECISION:\s*APPROVED\s*($|\n)/i.test(output)) {
  console.error(`AGY returned an invalid decision format:\n${output}`);
  throw new Error("AGY output did not contain a valid decision sentinel");
}

await request(`/api/issues/${issue.id}`, {
  method: "PATCH",
  body: JSON.stringify({ status: changesRequested ? "in_progress" : "done", comment: output }),
});

console.log(output);
