// One current-source load; never collects a Playwright catalog during feature work.
import { createServer } from "vite";

const server = await createServer({
  root: process.cwd(), appType: "custom", logLevel: "error",
  server: { hmr: false, middlewareMode: true },
});
try {
  const source = await server.ssrLoadModule("/src/app/app-acceptance.ts");
  if (!Array.isArray(source.appAcceptance)) throw new Error("app-acceptance.ts must export appAcceptance.");
  process.send({ rows: source.appAcceptance.map(({ id, browser, browserTestName, canvasHandle, evidence }) => ({
    id, browser, browserTestName, evidence,
    canvasHandle: canvasHandle ? { exportCleanTestName: canvasHandle.exportCleanTestName } : undefined,
  })) });
} finally {
  await server.close();
}
