import fs from "node:fs";
import jpeg from "jpeg-js";
import { segmentCrack } from "../js/segment.js";
import { assessCrack } from "../js/confidence.js";

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

function paint(width, height, painter) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 196;
    data[i + 1] = 184;
    data[i + 2] = 166;
    data[i + 3] = 255;
  }
  const set = (x, y, v) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = v;
  };
  painter(set, width, height);
  return { data, width, height };
}

const synthetics = {
  "one-crack": paint(220, 140, (set) => {
    for (let x = 20; x < 190; x++) set(x, 70 + ((x / 40) | 0) % 2, 40);
  }),
  "diagonal-crack": paint(200, 160, (set) => {
    for (let i = 15; i < 170; i++) set(i, 20 + Math.round(i * 0.7), 32);
  }),
  "stair-crack": paint(180, 140, (set, w, h) => {
    let x = 20;
    let y = 30;
    for (let step = 0; step < 5; step++) {
      for (let i = 0; i < 24; i++) set(x + i, y, 36);
      x += 24;
      for (let i = 0; i < 16; i++) set(x, y + i, 36);
      y += 16;
    }
  }),
  "two-cracks": paint(220, 140, (set) => {
    for (let x = 16; x < 200; x++) set(x, 40, 38);
    for (let x = 30; x < 180; x++) set(x, 96, 48);
  }),
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
      for (let t = 0; t < len; t++) set(Math.round(x0 + Math.cos(ang) * t), Math.round(y0 + Math.sin(ang) * t), 36);
    }
  }),
  wires: paint(220, 140, (set, w) => {
    for (let line = 0; line < 5; line++) {
      const y0 = 18 + line * 22;
      for (let x = 8; x < w - 8; x++) set(x, y0 + Math.round(Math.sin(x / 14) * 2), 30);
    }
  }),
  stucco: paint(220, 160, (set, w, h) => {
    for (let k = 0; k < 24; k++) {
      const cx = (k * 31) % (w - 40) + 16;
      const cy = (k * 23) % (h - 40) + 16;
      const r = 12 + (k % 5);
      for (let a = 0; a < 18; a++) {
        const t = (a / 17) * Math.PI * (0.7 + (k % 3) * 0.15);
        set(Math.round(cx + Math.cos(t + k) * r), Math.round(cy + Math.sin(t + k) * r), 40);
      }
    }
  }),
};

function report(name, image) {
  const raw = segmentCrack(image, { sensitivity: 0.55, keepRejected: true });
  console.log(
    name.padEnd(16),
    "accepted",
    String(raw.accepted).padEnd(5),
    (raw.verdict?.reason || "").padEnd(18),
    "px",
    String(raw.verdict?.total ?? raw.pixels).padEnd(5),
    "n",
    String(raw.verdict?.count ?? "").padEnd(3),
    "ratio",
    (raw.verdict?.ratio ?? 0).toFixed(2),
    "span",
    String(Math.round(raw.verdict?.longestSpan ?? 0)).padEnd(4),
    "chains",
    raw.verdict?.chains ?? "",
    "rivals",
    raw.verdict?.rivals ?? "",
    "spread",
    Math.round(raw.verdict?.spread ?? 0),
    "kept",
    raw.pixels,
  );
}

for (const [name, image] of Object.entries(synthetics)) report(name, image);

for (const file of fs.readdirSync("samples").filter((name) => name.endsWith(".jpg") || name.endsWith(".png"))) {
  const buf = fs.readFileSync(`samples/${file}`);
  const raw = file.endsWith(".png")
    ? null
    : jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
  if (!raw) continue;
  report(file, downscale(raw, 720));
}
