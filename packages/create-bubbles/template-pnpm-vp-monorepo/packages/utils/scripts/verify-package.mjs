import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { delimiter, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
const requiredFiles = new Set(["package.json"]);

assert.ok(manifest.name, "Package must have a name");

function verifyFile(target, field) {
  assert.equal(typeof target, "string", `${field} must reference a file`);
  const absolutePath = resolve(packageRoot, target);
  const relativePath = relative(packageRoot, absolutePath);
  assert.ok(
    relativePath && !relativePath.startsWith("..") && !isAbsolute(relativePath),
    `${field} must stay inside the package`,
  );
  assert.ok(existsSync(absolutePath), `${field} references a missing file: ${target}`);
  requiredFiles.add(relativePath.replaceAll("\\", "/"));
}

for (const field of ["main", "module", "types"]) {
  verifyFile(manifest[field], field);
}

function verifyExports(value, field = "exports") {
  if (typeof value === "string") {
    verifyFile(value, field);
    return;
  }
  assert.ok(value && typeof value === "object", `${field} must define export targets`);
  for (const [condition, target] of Object.entries(value)) {
    verifyExports(target, `${field}.${condition}`);
  }
}

verifyExports(manifest.exports);
const entry = manifest.exports["."];
assert.ok(entry?.import?.types?.endsWith(".d.ts"), "ESM exports must declare .d.ts types");
assert.ok(entry?.require?.types?.endsWith(".d.cts"), "CommonJS exports must declare .d.cts types");
assert.equal(manifest.type, "module", "ESM .js output requires type: module");
assert.ok(entry?.import?.default?.endsWith(".js"), "ESM exports must reference .js output");
assert.ok(entry?.require?.default?.endsWith(".cjs"), "CommonJS exports must reference .cjs output");

function verifyRuntime(module, format) {
  assert.equal(module.fn(), "Hello, tsdown!", `${format}: fn()`);
  assert.equal(module.clamp(5, 0, 10), 5, `${format}: value inside bounds`);
  assert.equal(module.clamp(-2, 0, 10), 0, `${format}: lower bound`);
  assert.equal(module.clamp(12, 0, 10), 10, `${format}: upper bound`);
  assert.equal(module.clamp(3, 2, 2), 2, `${format}: equal bounds`);
  for (const args of [
    [NaN, 0, 10],
    [Infinity, 0, 10],
    [1, -Infinity, 10],
    [1, 0, Infinity],
    [1, 10, 0],
  ]) {
    assert.throws(() => module.clamp(...args), RangeError, `${format}: invalid bounds or value`);
  }
}

verifyRuntime(await import(manifest.name), "ESM");
verifyRuntime(createRequire(import.meta.url)(manifest.name), "CommonJS");

// Invoke npm's JavaScript CLI directly when npm is installed as a Windows .cmd
// wrapper. Passing arguments to Node avoids shell quoting and interpolation.
function npmCommand() {
  const cliCandidates = [
    process.env.npm_execpath,
    join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
  ];
  for (const candidate of cliCandidates) {
    if (candidate?.endsWith("npm-cli.js") && existsSync(candidate)) {
      return { command: process.execPath, prefix: [candidate] };
    }
  }

  const extensions = process.platform === "win32" ? [".exe", ".cmd", ".bat"] : [""];
  const pathValue = process.env.PATH ?? process.env.Path ?? "";
  for (const directory of pathValue.split(delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = join(directory.replace(/^"|"$/g, ""), `npm${extension}`);
      if (!existsSync(candidate)) continue;
      if ([".cmd", ".bat"].includes(extname(candidate).toLowerCase())) {
        const cli = join(dirname(candidate), "node_modules", "npm", "bin", "npm-cli.js");
        if (existsSync(cli)) return { command: process.execPath, prefix: [cli] };
        continue;
      }
      return { command: candidate, prefix: [] };
    }
  }
  throw new Error("Cannot locate npm's executable or npm-cli.js; install Node.js with npm first.");
}

const { command, prefix } = npmCommand();
const result = spawnSync(command, [...prefix, "pack", "--dry-run", "--json", "--ignore-scripts"], {
  cwd: packageRoot,
  encoding: "utf8",
  shell: false,
  windowsHide: true,
  timeout: 60_000,
});
if (result.error) throw result.error;
assert.equal(result.status, 0, `npm pack failed:\n${result.stderr || result.stdout}`);
const [packed] = JSON.parse(result.stdout);
assert.ok(packed?.files?.length, "npm pack must report publishable files");
const publishedFiles = new Set(packed.files.map(({ path }) => path.replaceAll("\\", "/")));
for (const target of requiredFiles) {
  assert.ok(publishedFiles.has(target), `Published package is missing ${target}`);
}
for (const target of publishedFiles) {
  assert.ok(!/^(src|tests)\//.test(target), `Source or tests must not be published: ${target}`);
}
assert.ok(
  [...publishedFiles].some((target) => target.endsWith(".d.ts")),
  "Published package must include ESM declarations",
);
assert.ok(
  [...publishedFiles].some((target) => target.endsWith(".d.cts")),
  "Published package must include CommonJS declarations",
);

console.log(`Verified ${manifest.name}: ESM, CommonJS, declarations, and npm package contents.`);
