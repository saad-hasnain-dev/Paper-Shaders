import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readGalleryRelease } from "./release.mjs";
import { escapeRegex, inspectCoverage, parseRequest, scenarioGrep, selectScenarios, validateResults } from "./selection.mjs";
import { browserEnvironment, focusedBrowserPort, loadRows, runProcess } from "./process.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const request = parseRequest(process.argv.slice(2));
await readGalleryRelease(projectDir);
const catalog = JSON.parse(await fs.readFile(path.join(projectDir, "scripts/gallery-feature-catalog.json"), "utf8"));
const rows = await loadRows(projectDir);
if (request.mode === "list") {
  console.log(JSON.stringify(inspectCoverage(rows, catalog), null, 2));
} else {
  const plan = selectScenarios(rows, catalog, request);
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "toolcraft-feature-"));
  const outputPath = path.join(temporary, "result.json");
  console.log(`[toolcraft] ${plan.acceptanceIds.join(", ")} → ${plan.scenarios.length} functional scenario(s); no build, delivery or performance.`);
  try {
    await runProcess(path.join(projectDir, "node_modules/.bin/playwright"), [
      "test", "--config=scripts/gallery-workflow/playwright.config.mjs",
      ...[...new Set(plan.scenarios.map(({ file }) => file))].map((file) => `${escapeRegex(path.join(projectDir, file))}$`),
      "--grep", scenarioGrep(plan),
      "--workers=1", "--retries=0", "--forbid-only", "--max-failures=1",
      `--timeout=${plan.scenarios.some(({ budget }) => budget === "extended-io") ? 120000 : 30000}`,
      `--reporter=list,${path.join(projectDir, "scripts/gallery-workflow/reporter.mjs")}`,
    ], {
      cwd: projectDir,
      env: { ...browserEnvironment(projectDir), TOOLCRAFT_GALLERY_RESULT: outputPath,
        TOOLCRAFT_BROWSER_SERVER_MODE: "dev", TOOLCRAFT_TEST_PORT: await focusedBrowserPort() },
      timeout: 90000 + plan.scenarios.reduce((sum, item) => sum + (item.budget === "extended-io" ? 120000 : 30000), 0),
    });
    validateResults(plan, JSON.parse(await fs.readFile(outputPath, "utf8")));
    console.log("[toolcraft] Selected functional scenarios passed. This is not a full delivery/performance certificate.");
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}
