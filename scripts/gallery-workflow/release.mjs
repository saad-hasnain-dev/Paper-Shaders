import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const publicKey = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAqbjGwrHmhB5DcE09wdkmFrD90fNWcdXwxZDjAh2+CV8=
-----END PUBLIC KEY-----`;
export const releaseFile = "toolcraft-release.json";
export const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

export function releasePayload(record) {
  const { signature, ...payload } = record;
  return JSON.stringify(payload);
}

export function hasValidGallerySignature(record) {
  try {
    return typeof record.signature === "string" && crypto.verify(null, Buffer.from(releasePayload(record)), publicKey, Buffer.from(record.signature, "base64"));
  } catch { return false; }
}

export function safeRelativePath(value) {
  return typeof value === "string" && value.length > 0 &&
    !path.isAbsolute(value) && !value.includes("\\") &&
    !value.split("/").some((part) => !part || part === "." || part === "..");
}

export async function readGalleryRelease(projectDir, { optional = false } = {}) {
  let record;
  try {
    record = JSON.parse(await fs.readFile(path.join(projectDir, releaseFile), "utf8"));
  } catch (error) {
    if (optional && error.code === "ENOENT") return null;
    throw new Error("Missing or malformed gallery release. Restore it from the gallery source; do not invent a delivery receipt.", { cause: error });
  }
  if (record.version !== 1 || record.kind !== "gallery-release" ||
      record.initialDelivery !== "accepted-existing-product" ||
      record.evidence?.kind !== "owner-approval" || record.evidence.testsExecuted !== false ||
      !/^[a-z0-9-]+$/.test(record.slug ?? "") ||
      !record.workflowFiles || Object.keys(record.workflowFiles).length === 0 ||
      !record.packageScripts || !hasValidGallerySignature(record)) {
    throw new Error("Invalid gallery release authority/signature.");
  }
  for (const [file, hash] of Object.entries(record.workflowFiles)) {
    if (!safeRelativePath(file) || sha256(await fs.readFile(path.join(projectDir, file))) !== hash) {
      throw new Error(`Gallery workflow integrity mismatch: ${file}`);
    }
  }
  const pkg = JSON.parse(await fs.readFile(path.join(projectDir, "package.json"), "utf8"));
  for (const [name, command] of Object.entries(record.packageScripts)) {
    if (pkg.scripts?.[name] !== command) throw new Error(`Gallery workflow script mismatch: ${name}`);
  }
  return record;
}

export async function acceptExistingGalleryDelivery(projectDir, args = []) {
  if (args.length && !(args.length === 1 && args[0] === "--")) {
    throw new Error("verify:delivery accepts no arguments. Use test:feature for edits; performance is explicit separate work.");
  }
  const release = await readGalleryRelease(projectDir);
  const result = {
    kind: "accepted-gallery-release", slug: release.slug,
    status: "focused-development-only", evidence: "owner-approval",
    checksRun: [],
  };
  console.log(JSON.stringify(result));
  return result;
}
