#!/usr/bin/env node
/* Generates tray icon PNGs: a white upward-pointing triangle with an
   optional colored circle badge in the top-right corner. Produces @1x
   (22px) and @2x (44px) variants for each state. Uses 4x4 supersampling
   for smooth, anti-aliased edges. */
const { PNG } = require("pngjs");
const { writeFileSync, mkdirSync } = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "src", "resources", "icons");
mkdirSync(OUT, { recursive: true });

const SS = 4; // supersampling factor — 16 subsamples per output pixel
const TRI_COLOR = [245, 245, 245]; // slightly off-white so edges blend nicer
const GREEN = [34, 197, 94];
const RED = [239, 68, 68];
const YELLOW = [234, 179, 8];

// Geometry (fractions of icon size).
const TRI_TOP = 0.18;
const TRI_BOTTOM = 0.82;
const TRI_HALF_BASE = 0.42;     // half-width at the base
const BADGE_R = 0.26;           // badge radius
const BADGE_CX = 0.76;          // badge center x
const BADGE_CY = 0.24;          // badge center y
const BADGE_GAP = 0.09;         // cleared ring around badge (gap from triangle)

function insideCircle(x, y, cx, cy, r) {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function insideTriangle(x, y, apexX, top, bottom, halfBase) {
  if (y < top || y > bottom) return false;
  const t = (y - top) / (bottom - top);
  const half = halfBase * t;
  return Math.abs(x - apexX) <= half;
}

function sampleAt(x, y, size, badge) {
  const apexX = size / 2;
  const top = size * TRI_TOP;
  const bot = size * TRI_BOTTOM;
  const half = size * TRI_HALF_BASE;

  if (badge) {
    const bCx = size * BADGE_CX;
    const bCy = size * BADGE_CY;
    const bR = size * BADGE_R;
    const gap = size * BADGE_GAP;

    if (insideCircle(x, y, bCx, bCy, bR)) {
      return badge; // opaque badge color
    }
    if (insideCircle(x, y, bCx, bCy, bR + gap)) {
      return null; // cleared ring — transparent even over triangle
    }
  }
  if (insideTriangle(x, y, apexX, top, bot, half)) {
    return TRI_COLOR;
  }
  return null;
}

function makeIcon(size, badgeColor) {
  const png = new PNG({ width: size, height: size });
  png.data.fill(0);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let opaqueCount = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          const col = sampleAt(px, py, size, badgeColor);
          if (col) {
            sumR += col[0];
            sumG += col[1];
            sumB += col[2];
            opaqueCount++;
          }
        }
      }

      const idx = (y * size + x) * 4;
      const totalSamples = SS * SS;
      const alpha = Math.round((255 * opaqueCount) / totalSamples);
      if (opaqueCount > 0) {
        png.data[idx] = Math.round(sumR / opaqueCount);
        png.data[idx + 1] = Math.round(sumG / opaqueCount);
        png.data[idx + 2] = Math.round(sumB / opaqueCount);
        png.data[idx + 3] = alpha;
      }
    }
  }
  return png;
}

function save(png, filename) {
  const buf = PNG.sync.write(png);
  writeFileSync(path.join(OUT, filename), buf);
}

const scales = [
  [1, ""],
  [2, "@2x"],
];
const variants = [
  ["plain", null],
  ["green", GREEN],
  ["red", RED],
  ["yellow", YELLOW],
];

for (const [scale, suffix] of scales) {
  const size = 22 * scale;
  for (const [name, color] of variants) {
    save(makeIcon(size, color), `tray-${name}${suffix}.png`);
  }
}

console.log(`Wrote ${scales.length * variants.length} tray icons to ${OUT}`);
