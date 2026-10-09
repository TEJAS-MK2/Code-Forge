"use strict";
const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");
const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
for (const file of ["index.html", "styles.css", "core.js", "app.js"]) {
  fs.copyFileSync(path.join(root, file), path.join(dist, file));
}
esbuild.buildSync({
  entryPoints: [path.join(root, "src/editor.js")],
  outfile: path.join(dist, "editor.bundle.js"),
  bundle: true,
  format: "iife",
  target: ["es2020"],
  minify: true,
  legalComments: "none"
});
console.log("Built static site into dist/ with local CodeMirror assets.");
