import fs from "node:fs";
import jpeg from "jpeg-js";
import { segmentCrack } from "../js/segment.js";
import { measureCrack } from "../js/measure.js";
import { detectPattern } from "../js/risk.js";

const width = 640;
const height = 400;
const data = new Uint8Array(width * height * 4);
const cx = 118;
const cy = 92;
const radius = 36;

function noise(x, y) {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return (n - Math.floor(n)) - 0.5;
}

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    let value = 214 + noise(x, y) * 8;
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.hypot(dx, dy);
    if (dist <= radius) value = 236 + noise(x, y) * 3;
    const onCrack = y >= 214 && y <= 216 && x >= 70 && x <= 560;
    if (onCrack) value = 42;
    data[i] = value;
    data[i + 1] = value - 4;
    data[i + 2] = value - 12;
    data[i + 3] = 255;
  }
}

const image = { data, width, height };
const seg = segmentCrack(image, { sensitivity: 0.55 });
const measured = measureCrack(seg.mask, width, height, null, seg.gray);
const pattern = detectPattern(measured.skeleton, width, height);
const mmPerPx = 27 / (radius * 2);
console.log({
  accepted: seg.accepted,
  reason: seg.verdict?.reason,
  pixels: seg.pixels,
  lengthPx: Math.round(measured.lengthPx),
  widthPx: measured.maxWidthPx,
  widthMm: measured.maxWidthPx * mmPerPx,
  pattern: pattern.pattern,
});

fs.writeFileSync("samples/coin-demo.jpg", jpeg.encode({ data, width, height }, 80).data);
