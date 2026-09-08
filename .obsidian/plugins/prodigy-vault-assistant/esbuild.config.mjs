import { writeFile } from "node:fs/promises";
import { build } from "esbuild";

const production = process.argv[2] === "production";
const result = await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  platform: "browser",
  format: "cjs",
  target: "es2021",
  external: ["obsidian"],
  outfile: "main.js",
  sourcemap: production ? false : "inline",
  minify: production,
  treeShaking: true,
  metafile: production,
  logLevel: "info",
});

if (production && result.metafile) {
  await writeFile("build-metafile.json", `${JSON.stringify(result.metafile, null, 2)}\n`);
}
