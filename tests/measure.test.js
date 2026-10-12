import assert from "node:assert/strict";
import test from "node:test";
import {
  crackWidthPx,
  euclideanDistanceTransform,
  measureCrack,
  pixelsToMillimetres,
  profileWidthPx,
  skeletonLengthPx,
  zhangSuenThinning,
} from "../js/measure.js";

function fill(width, height, painter) {
  const mask = new Uint8Array(width * height);
  painter(mask, width, height);
  return mask;
}

test("distance transform of a 3 px crack is 1, 2, 1", () => {
  const mask = fill(5, 1, (m) => {
    m[1] = 1;
    m[2] = 1;
    m[3] = 1;
  });
  const distance = euclideanDistanceTransform(mask, 5, 1);
  assert.equal(distance[0], 0);
  assert.ok(Math.abs(distance[1] - 1) < 1e-4);
  assert.ok(Math.abs(distance[2] - 2) < 1e-4);
  assert.ok(Math.abs(distance[3] - 1) < 1e-4);
});

test("maximum width of a 3 px bar is 3 mm once scaled", () => {
  const width = 9;
  const height = 7;
  const mask = fill(width, height, (m) => {
    for (let y = 2; y <= 4; y++) {
      for (let x = 1; x <= 7; x++) m[y * width + x] = 1;
    }
  });
  const widths = crackWidthPx(mask, width, height);
  assert.ok(Math.abs(widths.max - 3) < 0.05, `max width ${widths.max}`);
  const measured = measureCrack(mask, width, height, 0.5);
  assert.ok(Math.abs(measured.maxWidthMm - 1.5) < 0.05);
});

test("skeleton length counts diagonal steps as √2", () => {
  const width = 8;
  const height = 8;
  const skeleton = fill(width, height, (m) => {
    for (let i = 1; i <= 5; i++) m[i * width + i] = 1;
  });
  const length = skeletonLengthPx(skeleton, width, height);
  assert.ok(Math.abs(length - 4 * Math.SQRT2) < 1e-6, `length ${length}`);
});

test("thinning keeps a horizontal hairline and shortens a filled block", () => {
  const width = 24;
  const height = 11;
  const line = fill(width, height, (m) => {
    for (let x = 2; x <= 20; x++) m[5 * width + x] = 1;
  });
  const thinned = zhangSuenThinning(line, width, height);
  let kept = 0;
  for (let x = 2; x <= 20; x++) if (thinned[5 * width + x]) kept += 1;
  assert.ok(kept >= 15, `kept ${kept} of the hairline`);

  const block = fill(width, height, (m) => {
    for (let y = 2; y <= 8; y++) {
      for (let x = 4; x <= 16; x++) m[y * width + x] = 1;
    }
  });
  const thinBlock = zhangSuenThinning(block, width, height);
  const before = block.reduce((s, v) => s + v, 0);
  const after = thinBlock.reduce((s, v) => s + v, 0);
  assert.ok(after < before / 3, `thinned ${after} from ${before}`);
});

test("pixels convert with the reference scale", () => {
  assert.equal(pixelsToMillimetres(10, 2.7), 27);
  assert.equal(pixelsToMillimetres(10, null), null);
});

test("profile width follows the dark dip, not a thick mask", () => {
  const width = 40;
  const height = 21;
  const gray = new Float32Array(width * height).fill(0.82);
  const skeleton = new Uint8Array(width * height);
  for (let x = 8; x <= 32; x++) {
    gray[10 * width + x] = 0.2;
    skeleton[10 * width + x] = 1;
  }
  const hairline = profileWidthPx(gray, skeleton, width, height);
  assert.ok(hairline.max <= 3, `hairline profile ${hairline.max}`);

  const wideGray = new Float32Array(width * height).fill(0.82);
  const wideSkeleton = new Uint8Array(width * height);
  for (let x = 8; x <= 32; x++) {
    for (let y = 8; y <= 12; y++) wideGray[y * width + x] = 0.18;
    wideSkeleton[10 * width + x] = 1;
  }
  const wide = profileWidthPx(wideGray, wideSkeleton, width, height);
  assert.ok(wide.max >= 4 && wide.max <= 7, `wide profile ${wide.max}`);
});

test("a straight 10 px hairline measures about 9 px long", () => {
  const width = 16;
  const height = 5;
  const mask = fill(width, height, (m) => {
    for (let x = 2; x <= 11; x++) m[2 * width + x] = 1;
  });
  const measured = measureCrack(mask, width, height, null);
  assert.ok(Math.abs(measured.lengthPx - 9) < 0.2, `length ${measured.lengthPx}`);
  assert.equal(measured.lengthMm, null);
  assert.ok(measured.maxWidthPx < 1.2, `width ${measured.maxWidthPx}`);
});
