import * as module from "node:module";
import { load, resolve } from "./asset-loader.mjs";
export function installSourceEnvironment() {
  if (module.registerHooks) module.registerHooks({ load, resolve });
}
if (module.registerHooks) module.registerHooks({ resolve });
else module.register("./asset-loader.mjs", import.meta.url);
