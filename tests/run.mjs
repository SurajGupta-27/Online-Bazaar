// Runs every tests/*.test.mjs file (or those matching the given names) one at a
// time, each against a fresh in-memory MongoDB. Usage:
//   npm test              run all
//   npm test -- orders    run tests/orders.test.mjs only
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL(".", import.meta.url));
const filters = process.argv.slice(2);
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".test.mjs"))
  .filter((f) => !filters.length || filters.some((name) => f.startsWith(name)));

let failed = [];
for (const file of files) {
  console.log(`\n=== ${file}`);
  const { status } = spawnSync(process.execPath, [dir + file], { stdio: "inherit" });
  if (status !== 0) failed.push(file);
}
console.log(failed.length ? `\nFAILED: ${failed.join(", ")}` : `\nAll ${files.length} test files passed`);
process.exit(failed.length ? 1 : 0);
