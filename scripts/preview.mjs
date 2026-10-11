import fs from "node:fs";
import path from "node:path";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { segmentCrack } from "../js/segment.js";
import { measureCrack } from "../js/measure.js";
import { detectPattern } from "../js/risk.js";

const samples = process.argv.slice(2);
const outDir = "/tmp/crack-preview";
fs.mkdirSync(outDir, { recursive: true });

function downscale(image, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(image.height - 1, Math.floor(y / scale));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(image.width - 1, Math.floor(x / scale));
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

for (const file of samples) {
  const raw = jpeg.decode(fs.readFileSync(file), { useTArray: true, formatAsRGBA: true });
  const image = downscale(raw, 720);
  const t0 = Date.now();
  const seg = segmentCrack(image, { sensitivity: 0.55 });
  const ms = Date.now() - t0;
  const measured = measureCrack(seg.mask, image.width, image.height, null, seg.gray);
  const pattern = detectPattern(measured.skeleton, image.width, image.height);
  let minX = image.width;
  let minY = image.height;
  let maxX = 0;
  let maxY = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (!seg.mask[y * image.width + x]) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      sx += x;
      sy += y;
    }
  }
  const cx = seg.pixels ? (sx / seg.pixels).toFixed(0) : "-";
  const cy = seg.pixels ? (sy / seg.pixels).toFixed(0) : "-";
  console.log(
    path.basename(file),
    `${image.width}x${image.height}`,
    `${ms}ms`,
    `px=${seg.pixels}`,
    `mode=${seg.mode}`,
    `len=${measured.lengthPx.toFixed(1)}`,
    `w=${measured.maxWidthPx.toFixed(2)}`,
    `mean=${measured.meanWidthPx.toFixed(1)}`,
    `median=${measured.medianWidthPx.toFixed(1)}`,
    measured.widthSource,
    pattern.pattern,
    `${pattern.angleDeg?.toFixed?.(0) ?? "-"}°`,
    `bbox=${minX},${minY}-${maxX},${maxY}`,
    `centroid=${cx},${cy}`,
  );

  const png = new PNG({ width: image.width, height: image.height });
  for (let i = 0, p = 0; i < seg.mask.length; i++, p += 4) {
    const on = seg.mask[i];
    png.data[p] = on ? 220 : image.data[p];
    png.data[p + 1] = on ? 48 : image.data[p + 1];
    png.data[p + 2] = on ? 32 : image.data[p + 2];
    png.data[p + 3] = 255;
  }
  const name = path.basename(file, path.extname(file)) + ".png";
  fs.writeFileSync(path.join(outDir, name), PNG.sync.write(png));
}
