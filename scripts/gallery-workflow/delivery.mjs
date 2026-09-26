import path from "node:path";
import { fileURLToPath } from "node:url";
import { acceptExistingGalleryDelivery } from "./release.mjs";

await acceptExistingGalleryDelivery(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."),
  process.argv.slice(2),
);
