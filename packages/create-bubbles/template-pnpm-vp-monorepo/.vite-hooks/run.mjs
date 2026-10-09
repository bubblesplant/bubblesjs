import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);
const [command, ...args] = process.argv.slice(2);
const commands = {
  staged: [resolve(dirname(require.resolve("vite-plus/package.json")), "bin/vp"), "staged"],
  commitlint: [resolve(dirname(require.resolve("@commitlint/cli/package.json")), "cli.js")],
};

if (!Object.hasOwn(commands, command)) {
  throw new Error(`未知 Git hook 命令: ${command}`);
}

const result = spawnSync(process.execPath, [...commands[command], ...args], { stdio: "inherit" });
process.exitCode = result.status ?? 1;
