import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import jpeg from "jpeg-js";
import { assessCrack } from "../js/confidence.js";
import { segmentCrack } from "../js/segment.js";

function paint(width, height, painter) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 196;
    data[i + 1] = 184;
    data[i + 2] = 166;
    data[i + 3] = 255;
  }
  painter((x, y, value) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 4;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }, width, height);
  return { data, width, height };
}

function lineMask(width, height, points) {
  const mask = new Uint8Array(width * height);
  for (const [x, y] of points) {
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    mask[y * width + x] = 1;
  }
  return mask;
}

test("a single long line is a crack and a field of parallel lines is not", () => {
  const crack = lineMask(180, 80, Array.from({ length: 140 }, (_, i) => [20 + i, 40]));
  const accepted = assessCrack(crack, 180, 80);
  assert.equal(accepted.accepted, true, accepted.reason);

  const grain = new Uint8Array(220 * 140);
  for (let row = 0; row < 6; row++) {
    for (let x = 8; x < 210; x++) grain[(18 + row * 20) * 220 + x] = 1;
  }
  const rejected = assessCrack(grain, 220, 140);
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.reason, "repeated lines");
});

test("short randomly oriented strokes are not a crack", () => {
  const mask = new Uint8Array(200 * 140);
  for (let k = 0; k < 14; k++) {
    const x0 = (k * 23) % 170;
    const y0 = (k * 17) % 110;
    const ang = ((k * 40) % 180) * Math.PI / 180;
    for (let t = 0; t < 14; t++) {
      const x = Math.round(x0 + Math.cos(ang) * t);
      const y = Math.round(y0 + Math.sin(ang) * t);
      if (x >= 0 && y >= 0 && x < 200 && y < 140) mask[y * 200 + x] = 1;
    }
  }
  const verdict = assessCrack(mask, 200, 140);
  assert.equal(verdict.accepted, false, verdict.reason);
});

test("a brick grid of separate joints is not a crack", () => {
  const mask = new Uint8Array(220 * 150);
  for (let row = 0, y = 16; y < 140; y += 24, row++) {
    const shift = row % 2 ? 18 : 0;
    for (let x0 = 8 + shift; x0 < 200; x0 += 40) {
      for (let x = x0; x < x0 + 22; x++) mask[y * 220 + x] = 1;
    }
  }
  for (let x = 20; x < 210; x += 40) {
    for (let y0 = 8; y0 < 130; y0 += 30) {
      for (let y = y0; y < y0 + 12; y++) mask[y * 220 + x] = 1;
    }
  }
  const verdict = assessCrack(mask, 220, 150);
  assert.equal(verdict.accepted, false, `${verdict.reason} span ${verdict.longestSpan}`);
});

test("segmentation rejects texture and keeps a real line", () => {
  const cases = {
    brick: paint(220, 150, (set, w, h) => {
      for (let row = 0, y = 14; y < h - 4; y += 22, row++) {
        const shift = row % 2 ? 16 : 0;
        for (let x0 = 6 + shift; x0 < w - 8; x0 += 36) {
          for (let x = x0; x < x0 + 24; x++) set(x, y, 48);
        }
      }
      for (let x = 16; x < w; x += 36) {
        for (let y0 = 8; y0 < h - 8; y0 += 28) {
          for (let y = y0; y < y0 + 14; y++) set(x, y, 48);
        }
      }
    }),
    wood: paint(240, 160, (set, w, h) => {
      for (let y = 12; y < h; y += 22) {
        for (let x = 4; x < w - 4; x++) set(x, y + (x % 30 < 15 ? 0 : 1), 36);
      }
    }),
    foliage: paint(200, 140, (set, w, h) => {
      for (let k = 0; k < 36; k++) {
        const x0 = (k * 37) % (w - 24);
        const y0 = (k * 19) % (h - 24);
        const ang = ((k * 47) % 180) * Math.PI / 180;
        const len = 16 + (k % 10);
        for (let t = 0; t < len; t++) {
          set(Math.round(x0 + Math.cos(ang) * t), Math.round(y0 + Math.sin(ang) * t), 36);
        }
      }
    }),
    wires: paint(220, 140, (set, w) => {
      for (let line = 0; line < 5; line++) {
        const y0 = 18 + line * 22;
        for (let x = 8; x < w - 8; x++) set(x, y0 + Math.round(Math.sin(x / 14) * 2), 30);
      }
    }),
    stucco: paint(220, 160, (set, w, h) => {
      for (let k = 0; k < 18; k++) {
        const x0 = (k * 29) % (w - 30);
        const y0 = (k * 19) % (h - 30);
        const ang = ((k * 53) % 180) * Math.PI / 180;
        for (let t = 0; t < 12; t++) {
          set(Math.round(x0 + Math.cos(ang) * t), Math.round(y0 + Math.sin(ang) * t), 42);
        }
      }
    }),
  };
  for (const [name, image] of Object.entries(cases)) {
    const found = segmentCrack(image, { sensitivity: 0.55 });
    assert.equal(found.accepted, false, `${name} was accepted (${found.verdict?.reason}, ${found.verdict?.total} px)`);
    assert.equal(found.pixels, 0, `${name} still has ${found.pixels} crack pixels`);
  }

  const cracked = paint(220, 140, (set) => {
    for (let x = 20; x < 190; x++) set(x, 70, 40);
  });
  const found = segmentCrack(cracked, { sensitivity: 0.55 });
  assert.equal(found.accepted, true, found.verdict?.reason);
  assert.ok(found.pixels > 80, `crack pixels ${found.pixels}`);
});

function downscale(image, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(image.height - 1, Math.floor((y + 0.5) / scale));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(image.width - 1, Math.floor((x + 0.5) / scale));
      const from = (sy * image.width + sx) * 4;
      const to = (y * width + x) * 4;
      data[to] = image.data[from];
      data[to + 1] = image.data[from + 1];
      data[to + 2] = image.data[from + 2];
      data[to + 3] = 255;
    }
  }
  return { data, width, height };
}

test("the bundled crack photos still pass the gate", () => {
  for (const file of ["plaster-cream.jpg", "kilfane-wall.jpg", "exeter-diagonal.jpg", "stepped-tbilisi.jpg"]) {
    const raw = jpeg.decode(fs.readFileSync(new URL(`../samples/${file}`, import.meta.url)), {
      useTArray: true,
      formatAsRGBA: true,
    });
    const found = segmentCrack(downscale(raw, 720), { sensitivity: 0.55 });
    assert.equal(found.accepted, true, `${file} rejected: ${found.verdict?.reason}`);
    assert.ok(found.pixels > 200, `${file} kept only ${found.pixels} px`);
  }
});
