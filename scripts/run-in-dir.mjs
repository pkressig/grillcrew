import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [, , dir, command, ...args] = process.argv;

if (!dir || !command) {
  console.error("Usage: node scripts/run-in-dir.mjs <dir> <command> [args...]");
  process.exit(2);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cwd = path.resolve(repoRoot, dir);

const result = spawnSync(command, args, {
  cwd,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    INIT_CWD: cwd,
  },
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
