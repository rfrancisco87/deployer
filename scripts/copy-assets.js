#!/usr/bin/env node
/* Copies non-TS assets (HTML, PNGs) from src/ into dist/, preserving
   layout so runtime paths resolve the same in dev and packaged builds. */
const { mkdirSync, copyFileSync, readdirSync, statSync, existsSync } = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "src");
const OUT = path.join(__dirname, "..", "dist");

if (!existsSync(SRC)) {
  console.error(`copy-assets: source dir not found at ${SRC}`);
  process.exit(1);
}

const EXT_ALLOWLIST = new Set([".html", ".png", ".svg", ".icns"]);
let copied = 0;

function walk(rel) {
  const abs = path.join(SRC, rel);
  for (const entry of readdirSync(abs)) {
    const entryRel = path.join(rel, entry);
    const entryAbs = path.join(SRC, entryRel);
    if (statSync(entryAbs).isDirectory()) {
      walk(entryRel);
    } else if (EXT_ALLOWLIST.has(path.extname(entry).toLowerCase())) {
      const dest = path.join(OUT, entryRel);
      mkdirSync(path.dirname(dest), { recursive: true });
      copyFileSync(entryAbs, dest);
      copied++;
    }
  }
}

walk("");
console.log(`copy-assets: copied ${copied} file(s) into ${OUT}`);
