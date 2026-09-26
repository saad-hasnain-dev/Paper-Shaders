import { safeRelativePath } from "./release.mjs";

export const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function scenarioGrep(plan) {
  return plan.scenarios.map(({ file, testName }) =>
    `(?:^|\\s)${escapeRegex(file.slice("e2e/".length))} (?:.* )?${escapeRegex(testName)}$`).join("|");
}

export function parseRequest(args) {
  if (args[0] === "--") args = args.slice(1);
  if (args.length === 1 && ["--all", "--list"].includes(args[0])) return { mode: args[0].slice(2) };
  if (!args.length || new Set(args).size !== args.length || args.some((id) => !id.trim() || id !== id.trim() || id.startsWith("-"))) {
    throw new Error("Use test:feature -- <acceptance-id> [...ids], --list, or explicit --all. No empty or duplicate selection.");
  }
  return { mode: "ids", ids: args };
}

export function selectScenarios(rows, catalog, request) {
  if (!Array.isArray(rows) || !rows.length) throw new Error("App acceptance is empty.");
  const byId = new Map();
  for (const row of rows) {
    if (!row.id || byId.has(row.id)) throw new Error(`Invalid/duplicate acceptance ID: ${row.id}`);
    byId.set(row.id, row);
  }
  const ids = request.mode === "all" || request.mode === "list" ? [...byId.keys()] : request.ids;
  const scenarios = new Map();
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) throw new Error(`Unknown acceptance ID: ${id}`);
    const descriptor = typeof row.browser === "object" ? row.browser : null;
    const names = [descriptor?.testName ?? row.browserTestName, row.canvasHandle?.exportCleanTestName].filter(Boolean);
    if (!row.browser || !names.length) throw new Error(`No browser scenario declared for ${id}. Add a focused product test first.`);
    for (const name of new Set(names)) {
      const file = name === descriptor?.testName ? descriptor.file : catalog[name];
      if (!safeRelativePath(file) || !/^e2e\/.*\.spec\.[cm]?[jt]sx?$/.test(file) ||
          /browser perf:|toolcraft kernel:/.test(name)) {
        throw new Error(`Missing/invalid functional descriptor for ${id}: ${name}. Update scripts/gallery-feature-catalog.json or declare browser: { file, testName, budget }.`);
      }
      const budget = descriptor?.budget ?? (row.evidence === "exported-bytes" || row.evidence === "media-lifecycle" || row.evidence === "persistence-state" ? "extended-io" : "standard");
      if (!["standard", "extended-io"].includes(budget)) throw new Error(`Unsupported budget for ${id}`);
      const key = `${file}\0${name}`;
      const item = scenarios.get(key) ?? { file, testName: name, ids: [], budget };
      if (budget === "extended-io") item.budget = budget;
      if (!item.ids.includes(id)) item.ids.push(id);
      scenarios.set(key, item);
    }
  }
  if (!scenarios.size) throw new Error("Empty functional selection.");
  return { acceptanceIds: ids, scenarios: [...scenarios.values()] };
}

export function validateResults(plan, result) {
  if (result.status !== "passed") throw new Error(`Focused browser run ${result.status ?? "did not complete"}.`);
  if (!Array.isArray(result.tests) || result.tests.length !== plan.scenarios.length) throw new Error("Missing, duplicate or unexpected browser results.");
  for (const scenario of plan.scenarios) {
    const matches = result.tests.filter((test) => test.file === scenario.file && test.testName === scenario.testName);
    if (matches.length !== 1 || matches[0].status !== "passed" || matches[0].retry !== 0 || matches[0].expectedStatus !== "passed") {
      throw new Error(`Selected browser scenario did not pass exactly once: ${scenario.testName}`);
    }
  }
}

export function inspectCoverage(rows, catalog) {
  const available = [], unmapped = [];
  for (const row of rows) {
    try { available.push(selectScenarios(rows, catalog, { mode: "ids", ids: [row.id] })); }
    catch (error) { unmapped.push({ id: row.id, reason: error.message }); }
  }
  return { available, unmapped };
}
