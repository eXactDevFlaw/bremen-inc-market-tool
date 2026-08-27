import { isSea } from "node:sea";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolves the directory the app's data/public files should live next to.
 * As a packaged single-executable binary this is the executable's own
 * directory (so data/public sit beside the .exe wherever the user put it).
 * In dev/source mode (tsx) it's the project root.
 */
export function getAppDir(): string {
  if (isSea()) {
    return path.dirname(process.execPath);
  }
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}
