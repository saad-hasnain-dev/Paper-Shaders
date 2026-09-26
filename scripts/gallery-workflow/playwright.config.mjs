import path from "node:path";
import { fileURLToPath } from "node:url";
import base from "../../playwright.config.ts";
import { installSourceEnvironment } from "./register-assets.mjs";

installSourceEnvironment();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
// Preserve app launch/browser settings, but never attach aggregate evidence
// reporters or global certification to this focused compatibility route.
export default {
  ...base,
  testDir: path.join(root, "e2e"),
  outputDir: path.join(root, "test-results"),
  reporter: [["list"]],
  webServer: base.webServer ? { ...base.webServer, cwd: root } : undefined,
};
