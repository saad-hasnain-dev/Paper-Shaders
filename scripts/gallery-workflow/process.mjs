import { fork, spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import net from "node:net";

export async function focusedBrowserPort(env = process.env) {
  if (env.TOOLCRAFT_TEST_PORT) {
    const port = Number(env.TOOLCRAFT_TEST_PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid TOOLCRAFT_TEST_PORT.");
    return String(port);
  }
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(String(port)));
    });
  });
}

export function browserEnvironment(projectDir, env = process.env) {
  const clean = focusedEnvironment(env);
  const loader = pathToFileURL(path.join(projectDir, "scripts/gallery-workflow/register-assets.mjs"));
  return { ...clean, NODE_OPTIONS: `${clean.NODE_OPTIONS ?? ""} --import=${loader.href}`.trim() };
}

export function focusedEnvironment(env = process.env) {
  return Object.fromEntries(Object.entries(env).filter(([name]) =>
    !/^TOOLCRAFT_(?:.*PERFORMANCE|.*LEDGER|.*KERNEL|FEATURE_VERIFICATION|BROWSER_SERVER_MODE|RESOLVED_TEST_PORT)/.test(name) &&
    !/^PLAYWRIGHT_(?:GREP|TEST)/.test(name)));
}

export function loadRows(projectDir) {
  return new Promise((resolve, reject) => {
    const child = fork(path.join(projectDir, "scripts/gallery-workflow/source-child.mjs"), [], {
      cwd: projectDir, env: focusedEnvironment(), execArgv: [], stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    const messages = [];
    let stderr = "";
    child.stderr.on("data", (data) => { stderr = (stderr + data).slice(-10000); });
    child.on("message", (message) => messages.push(message));
    const timer = setTimeout(() => child.kill("SIGKILL"), 30000);
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0 || messages.length !== 1 || !Array.isArray(messages[0]?.rows)) {
        reject(new Error(`Cannot load current acceptance source (${code}): ${stderr}`));
      } else resolve(messages[0].rows);
    });
  });
}

export function runProcess(command, args, { cwd, env = process.env, timeout = 180000, capture = false }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, detached: process.platform !== "win32", stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit" });
    let stdout = "", stderr = "", timedOut = false;
    child.stdout?.on("data", (data) => { stdout += data; });
    child.stderr?.on("data", (data) => { stderr += data; });
    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
    }, timeout);
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0 || timedOut) reject(new Error(`Command failed (${timedOut ? "deadline" : code}): ${command} ${args.join(" ")}\n${stderr}\n${stdout.slice(-10000)}`));
      else resolve(stdout);
    });
  });
}
