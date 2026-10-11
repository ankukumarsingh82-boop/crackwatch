import assert from "node:assert/strict";
import test from "node:test";
import { classifyRisk, detectPattern } from "../js/risk.js";

function skeleton(width, height, points) {
  const mask = new Uint8Array(width * height);
  for (const [x, y] of points) mask[y * width + x] = 1;
  return mask;
}

test("width bands: hairline, monitor, engineer", () => {
  assert.equal(classifyRisk({ maxWidthMm: 0.29, pattern: "along" }).level, "hairline");
  assert.equal(classifyRisk({ maxWidthMm: 0.3, pattern: "along" }).level, "monitor");
  assert.equal(classifyRisk({ maxWidthMm: 3, pattern: "along" }).level, "monitor");
  assert.equal(classifyRisk({ maxWidthMm: 3.01, pattern: "along" }).level, "engineer");
});

test("diagonal and stair-step patterns outrank a hairline width", () => {
  const diagonal = classifyRisk({ maxWidthMm: 0.15, pattern: "diagonal" });
  const steps = classifyRisk({ maxWidthMm: 0.15, pattern: "stairstep" });
  assert.equal(diagonal.level, "engineer");
  assert.equal(steps.level, "engineer");
  assert.ok(diagonal.reasons.some((line) => /diagonal/i.test(line)));
  assert.ok(steps.reasons.some((line) => /stair/i.test(line)));
});

test("no scale means no risk rating", () => {
  const result = classifyRisk({ maxWidthMm: null, pattern: "along" });
  assert.equal(result.level, "unscaled");
  assert.equal(result.title, "Scale needed");
});

test("a horizontal centreline is not called diagonal", () => {
  const points = [];
  for (let x = 2; x <= 30; x++) points.push([x, 8]);
  const pattern = detectPattern(skeleton(34, 16, points), 34, 16);
  assert.equal(pattern.pattern, "along");
  assert.ok(pattern.angleDeg < 15, `angle ${pattern.angleDeg}`);
});

test("a 45° centreline is diagonal", () => {
  const points = [];
  for (let i = 2; i <= 24; i++) points.push([i, i]);
  const pattern = detectPattern(skeleton(28, 28, points), 28, 28);
  assert.equal(pattern.pattern, "diagonal");
  assert.ok(pattern.angleDeg > 35 && pattern.angleDeg < 55, `angle ${pattern.angleDeg}`);
});

test("one corner is not a stair-step, and two separate cracks are judged apart", () => {
  const corner = [];
  for (let x = 2; x <= 16; x++) corner.push([x, 4]);
  for (let y = 5; y <= 16; y++) corner.push([16, y]);
  const cornerPattern = detectPattern(skeleton(22, 20, corner), 22, 20);
  assert.notEqual(cornerPattern.pattern, "stairstep");

  const separate = [];
  for (let x = 2; x <= 20; x++) separate.push([x, 3]);
  for (let y = 2; y <= 18; y++) separate.push([24, y]);
  const separatePattern = detectPattern(skeleton(28, 22, separate), 28, 22);
  assert.notEqual(separatePattern.pattern, "stairstep");
  assert.equal(separatePattern.pattern, "along");
});

test("a stair of horizontal and vertical runs is stair-step", () => {
  const points = [];
  for (let x = 2; x <= 12; x++) points.push([x, 4]);
  for (let y = 5; y <= 12; y++) points.push([12, y]);
  for (let x = 13; x <= 24; x++) points.push([x, 12]);
  const pattern = detectPattern(skeleton(28, 18, points), 28, 18);
  assert.equal(pattern.pattern, "stairstep");
});
