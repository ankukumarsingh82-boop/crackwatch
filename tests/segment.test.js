import assert from "node:assert/strict";
import test from "node:test";
import { segmentCrack } from "../js/segment.js";

function paint(width, height, painter) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 214;
    data[i + 1] = 208;
    data[i + 2] = 198;
    data[i + 3] = 255;
  }
  painter(data, width, height);
  return { data, width, height };
}

function setPixel(data, width, x, y, value) {
  const i = (y * width + x) * 4;
  data[i] = value;
  data[i + 1] = value;
  data[i + 2] = value;
}

test("a dark line on plaster is segmented and a blank wall is not", () => {
  const blank = paint(96, 48, () => {});
  const empty = segmentCrack(blank, { sensitivity: 0.7 });
  assert.ok(empty.pixels < 15, `blank wall produced ${empty.pixels} px`);

  const cracked = paint(96, 64, (data, width) => {
    for (let x = 8; x <= 86; x++) setPixel(data, width, x, 32, 36);
  });
  const found = segmentCrack(cracked, { sensitivity: 0.6 });
  let hits = 0;
  for (let x = 8; x <= 86; x++) {
    let near = false;
    for (let y = 29; y <= 35; y++) {
      if (found.mask[y * cracked.width + x]) near = true;
    }
    if (near) hits += 1;
  }
  assert.ok(hits > 50, `line coverage ${hits}, mode ${found.mode}, pixels ${found.pixels}`);
});

test("a diagonal crack is recovered", () => {
  const cracked = paint(80, 80, (data, width) => {
    for (let i = 8; i <= 70; i++) setPixel(data, width, i, i, 28);
  });
  const found = segmentCrack(cracked, { sensitivity: 0.65 });
  let hits = 0;
  for (let i = 8; i <= 70; i++) {
    for (let dy = -2; dy <= 2; dy++) {
      const y = i + dy;
      if (y < 0 || y >= 80) continue;
      if (found.mask[y * 80 + i]) hits += 1;
    }
  }
  assert.ok(hits > 30, `diagonal hits ${hits}, pixels ${found.pixels}`);
});
