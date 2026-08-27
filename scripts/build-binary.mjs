// Baut eine eigenstaendige ausfuehrbare Datei (Node Single Executable Application)
// fuer die aktuell laufende Plattform. Cross-Compiling wird von Node SEA nicht
// unterstuetzt - fuer Windows/macOS-Builds muss dieses Skript auf der jeweiligen
// Zielplattform (oder in einer CI-Matrix) laufen.
import { build } from "esbuild";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const platform = process.platform; // 'linux' | 'darwin' | 'win32'
const execName = platform === "win32" ? "bremen-inc-market-tool.exe" : "bremen-inc-market-tool";
const outDir = path.join(root, "dist-bin", platform);

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

console.log("[1/4] Buendle Server-Code mit esbuild...");
await build({
  entryPoints: [path.join(root, "src/server.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: path.join(root, "dist/bundle.mjs"),
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
});

console.log("[2/4] Erzeuge sea-config.json...");
const seaConfigPath = path.join(root, "dist/sea-config.json");
fs.writeFileSync(
  seaConfigPath,
  JSON.stringify(
    {
      main: "dist/bundle.mjs",
      mainFormat: "module",
      output: path.relative(root, path.join(outDir, execName)),
      disableExperimentalSEAWarning: true,
    },
    null,
    2,
  ),
);

console.log("[3/4] node --build-sea (dauert etwas)...");
execSync(`node --build-sea "${seaConfigPath}"`, { cwd: root, stdio: "inherit" });

if (platform === "darwin") {
  console.log("[3b/4] macOS Codesigning (ad-hoc)...");
  execSync(`codesign --sign - "${path.join(outDir, execName)}"`, { stdio: "inherit" });
}

console.log("[4/4] Kopiere public/ neben die Executable...");
fs.cpSync(path.join(root, "public"), path.join(outDir, "public"), { recursive: true });

console.log(`\nFertig: ${path.join(outDir, execName)}`);
console.log(`Starten mit: ${path.join("dist-bin", platform, execName)}`);
