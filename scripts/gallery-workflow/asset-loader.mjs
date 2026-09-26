// Playwright's Node process must read the same real inline defaults as Vite.
// Never substitute dummy image bytes to make product acceptance importable.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const mime = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml", avif: "image/avif" };
export function resolve(specifier, context, nextResolve) {
  if (/\.(?:jpe?g|png|webp|gif|svg|avif)\?inline$/.test(specifier)) {
    const url = specifier.startsWith("@/")
      ? pathToFileURL(path.resolve(process.cwd(), "src", specifier.slice(2).replace(/\?inline$/, "")))
      : new URL(specifier.replace(/\?inline$/, ""), context.parentURL);
    const type = mime[path.extname(url.pathname).slice(1)];
    const data = fs.readFileSync(url);
    const source = `export default ${JSON.stringify(`data:${type};base64,${data.toString("base64")}`)};`;
    return { url: `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export function load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  const adapt = (loaded) => {
    if (!url.startsWith("file:") || loaded.format !== "module" || !loaded.source) return loaded;
    const source = typeof loaded.source === "string" ? loaded.source : Buffer.from(loaded.source).toString("utf8");
    if (!source.includes("import.meta.env")) return loaded;
    // This runner serves the real app in Vite development mode. Supply Vite's
    // built-in environment to Node-side schema imports, not production defaults.
    return { ...loaded, source: `import.meta.env ??= ${JSON.stringify({ BASE_URL: "/", MODE: "development", DEV: true, PROD: false, SSR: true })};\n${source}` };
  };
  return result?.then ? result.then(adapt) : adapt(result);
}
