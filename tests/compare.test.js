import assert from "node:assert/strict";
import test from "node:test";
import { compareMasks } from "../js/compare.js";

test("a crack that extends is growth, a one-pixel shift is not", () => {
  const width = 80;
  const height = 20;
  const older = new Uint8Array(width * height);
  const shifted = new Uint8Array(width * height);
  const grown = new Uint8Array(width * height);
  for (let x = 4; x <= 20; x++) {
    older[8 * width + x] = 1;
    shifted[9 * width + x] = 1;
    grown[8 * width + x] = 1;
  }
  for (let x = 21; x <= 70; x++) grown[8 * width + x] = 1;

  const stable = compareMasks(older, shifted, width, height);
  assert.equal(stable.grew, false);

  const extended = compareMasks(older, grown, width, height);
  assert.equal(extended.grew, true);
  assert.ok(extended.growth >= 12);
});
