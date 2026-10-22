// Run with: npm run test:rules
// Checks the hard rules only. No AI and no API key are used here.
import { readFileSync } from "node:fs";
import { runRules, validateInput } from "../lib/rules.ts";

const cases = JSON.parse(readFileSync(new URL("./cases.json", import.meta.url), "utf8"));
let failed = 0;

for (const c of cases) {
  const problems = [];
  const check = validateInput(c.form);

  if (check.ok !== c.expect.valid) {
    problems.push(`validation: expected ok=${c.expect.valid}, got ok=${check.ok}`);
  } else if (check.ok) {
    const report = runRules(c.rules);
    if (c.expect.overall && report.overall !== c.expect.overall) {
      problems.push(`overall: expected ${c.expect.overall}, got ${report.overall}`);
    }
    for (const [id, status] of Object.entries(c.expect.checks ?? {})) {
      const got = report.checks.find((x) => x.id === id)?.status;
      if (got !== status) problems.push(`${id}: expected ${status}, got ${got}`);
    }
    for (const item of c.expect.askFor ?? []) {
      if (!report.askFor.includes(item)) problems.push(`askFor is missing "${item}"`);
    }
  }

  console.log(`${problems.length ? "FAIL" : "PASS"}  ${c.name}`);
  for (const p of problems) console.log(`        ${p}`);
  if (problems.length) failed++;
}

console.log(failed ? `\n${failed} of ${cases.length} failed` : `\nAll ${cases.length} passed`);
process.exitCode = failed ? 1 : 0;
