/**
 * Risk rules for a photographed crack.
 *
 * These are screening rules for a housing-society photo, not a structural
 * assessment. Width bands follow the brief:
 *   hairline  < 0.3 mm
 *   monitor   0.3 mm to 3 mm
 *   engineer  > 3 mm, or a diagonal / stair-step pattern at any width
 *
 * Pattern is read from the skeleton. A stair-step is a crack that spends
 * real length both across and down (the mortar-joint pattern in masonry).
 * A diagonal is a consistent slant between 25° and 65° from horizontal.
 */

export const HAIRLINE_MAX_MM = 0.3;
export const ENGINEER_MIN_MM = 3;
export const DIAGONAL_MIN_DEG = 25;
export const DIAGONAL_MAX_DEG = 65;

function formatMm(value) {
  if (value >= 10) return value.toFixed(0);
  if (value >= 1) return value.toFixed(1);
  return value.toFixed(2);
}

function on(skeleton, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  return Boolean(skeleton[y * width + x]);
}

/**
 * Skeleton adjacency. A diagonal link is dropped when it only cuts the
 * corner of an orthogonal bend — otherwise every stair-step looks branched.
 * A true diagonal crack has no orthogonal pixel beside that link, so it stays.
 */
function neighborsOf(skeleton, width, height, x, y) {
  const found = [];
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    if (on(skeleton, width, height, x + dx, y + dy)) found.push([x + dx, y + dy]);
  }
  for (const [dx, dy] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    if (!on(skeleton, width, height, x + dx, y + dy)) continue;
    if (on(skeleton, width, height, x + dx, y) || on(skeleton, width, height, x, y + dy)) continue;
    found.push([x + dx, y + dy]);
  }
  return found;
}

function stepKind(dx, dy) {
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (adx > ady) return "H";
  if (ady > adx) return "V";
  return "D";
}

/** Walk a polyline from an endpoint and compress it into H/V/D runs. */
function directionRuns(skeleton, width, height) {
  const pixels = [];
  const endpoints = [];
  let junctions = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!skeleton[y * width + x]) continue;
      pixels.push([x, y]);
      const degree = neighborsOf(skeleton, width, height, x, y).length;
      if (degree <= 1) endpoints.push([x, y]);
      if (degree >= 3) junctions += 1;
    }
  }
  if (!pixels.length) return { runs: [], junctions, pixels: 0 };

  const seen = new Uint8Array(width * height);
  const start = endpoints[0] || pixels[0];
  let current = start;
  let previous = null;
  const steps = [];
  for (let guard = 0; guard < pixels.length + 2; guard++) {
    const key = current[1] * width + current[0];
    if (seen[key]) break;
    seen[key] = 1;
    const next = neighborsOf(skeleton, width, height, current[0], current[1]).find(([nx, ny]) => {
      if (previous && nx === previous[0] && ny === previous[1]) return false;
      return !seen[ny * width + nx];
    });
    if (!next) break;
    steps.push(stepKind(next[0] - current[0], next[1] - current[1]));
    previous = current;
    current = next;
  }

  const runs = [];
  for (const kind of steps) {
    const last = runs[runs.length - 1];
    if (last && last.kind === kind) last.length += 1;
    else runs.push({ kind, length: 1 });
  }
  return { runs, junctions, pixels: pixels.length };
}

function stairSwitches(runs) {
  const significant = runs.filter((run) => run.kind !== "D" && run.length >= 5);
  let switches = 0;
  let horizontal = 0;
  let vertical = 0;
  for (let i = 0; i < significant.length; i++) {
    if (significant[i].kind === "H") horizontal += significant[i].length;
    if (significant[i].kind === "V") vertical += significant[i].length;
    if (i > 0 && significant[i].kind !== significant[i - 1].kind) switches += 1;
  }
  return { switches, horizontal, vertical };
}

function analyseComponent(skeleton, width, height) {
  let n = 0;
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumYY = 0;
  let sumXY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!skeleton[y * width + x]) continue;
      n += 1;
      sumX += x;
      sumY += y;
      sumXX += x * x;
      sumYY += y * y;
      sumXY += x * y;
    }
  }
  if (n < 8) {
    return {
      pattern: "unclear",
      angleDeg: null,
      pixels: n,
      summary: "Too little crack was found to judge the direction.",
    };
  }

  const meanX = sumX / n;
  const meanY = sumY / n;
  const xx = sumXX - n * meanX * meanX;
  const yy = sumYY - n * meanY * meanY;
  const xy = sumXY - n * meanX * meanY;
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  const angleDeg = Math.abs((angle * 180) / Math.PI);
  const traced = directionRuns(skeleton, width, height);
  const stair = stairSwitches(traced.runs);
  const messy = traced.junctions >= 8;

  let pattern = "along";
  if (
    !messy &&
    stair.switches >= 2 &&
    stair.horizontal >= 8 &&
    stair.vertical >= 8
  ) {
    pattern = "stairstep";
  } else if (
    traced.junctions < 10 &&
    angleDeg >= DIAGONAL_MIN_DEG &&
    angleDeg <= DIAGONAL_MAX_DEG
  ) {
    pattern = "diagonal";
  }

  const summary = {
    along:
      angleDeg < 20
        ? "The crack runs mostly across."
        : angleDeg > 70
          ? "The crack runs mostly up and down."
          : "The crack follows one main direction.",
    diagonal: `The crack runs diagonally, about ${Math.round(angleDeg)}° from horizontal.`,
    stairstep:
      "The crack steps across and down, the pattern brickwork makes when a wall shifts along the mortar.",
    unclear: "The direction is unclear.",
  }[pattern];

  return { pattern, angleDeg, pixels: n, junctions: traced.junctions, summary };
}

function splitComponents(skeleton, width, height) {
  const labels = new Int32Array(width * height);
  const parts = [];
  const qx = new Int32Array(skeleton.length);
  const qy = new Int32Array(skeleton.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x;
      if (!skeleton[start] || labels[start]) continue;
      const mask = new Uint8Array(width * height);
      let head = 0;
      let tail = 0;
      qx[tail] = x;
      qy[tail] = y;
      tail += 1;
      labels[start] = parts.length + 1;
      mask[start] = 1;
      while (head < tail) {
        const cx = qx[head];
        const cy = qy[head];
        head += 1;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const ni = ny * width + nx;
            if (!skeleton[ni] || labels[ni]) continue;
            labels[ni] = parts.length + 1;
            mask[ni] = 1;
            qx[tail] = nx;
            qy[tail] = ny;
            tail += 1;
          }
        }
      }
      parts.push(mask);
    }
  }
  return parts;
}

/**
 * Orientation of the crack centreline.
 * Separate cracks are judged on their own. A stair-step is one polyline
 * that switches between across and down at least twice — a field of
 * unrelated cracks is not treated as that pattern.
 * Returns pattern: "along" | "diagonal" | "stairstep" | "unclear"
 */
export function detectPattern(skeleton, width, height) {
  const parts = splitComponents(skeleton, width, height);
  if (!parts.length) {
    return {
      pattern: "unclear",
      angleDeg: null,
      pixels: 0,
      summary: "Too little crack was found to judge the direction.",
    };
  }
  const analysed = parts
    .map((part) => analyseComponent(part, width, height))
    .filter((part) => part.pixels >= 8)
    .sort((a, b) => b.pixels - a.pixels);
  if (!analysed.length) {
    return {
      pattern: "unclear",
      angleDeg: null,
      pixels: 0,
      summary: "Too little crack was found to judge the direction.",
    };
  }
  const longest = analysed[0].pixels;
  const significant = analysed.filter((part) => part.pixels >= longest * 0.28);
  const rank = { stairstep: 3, diagonal: 2, along: 1, unclear: 0 };
  significant.sort((a, b) => rank[b.pattern] - rank[a.pattern] || b.pixels - a.pixels);
  return significant[0];
}

const LEVEL_COPY = {
  unscaled: {
    title: "Scale needed",
    summary:
      "The outline is ready. Place a ₹10 coin (27 mm across) on the same surface, or tap two points a known distance apart, to turn pixels into millimetres.",
  },
  hairline: {
    title: "Hairline",
    summary:
      "This looks like a hairline, the sort plaster and concrete often make as they dry. Photograph it again in a few months. If it lengthens, widens, or new cracks join it, ask a structural engineer.",
  },
  monitor: {
    title: "Monitor",
    summary:
      "Wide enough to keep an eye on, not yet in the band that by itself means calling an engineer. Measure it again in a few weeks with the same reference. If it passes 3 mm, keeps travelling, or turns diagonal, get it seen.",
  },
  engineer: {
    title: "See an engineer",
    summary:
      "This photo is in the range where a structural engineer should see the building, not just the picture. A crack wider than about 3 mm, or a diagonal or stair-step crack, can mean the structure is moving.",
  },
};

/**
 * @param {{ maxWidthMm: number|null, pattern?: string }} input
 */
export function classifyRisk({ maxWidthMm, pattern = "unclear" }) {
  if (maxWidthMm == null || Number.isNaN(maxWidthMm)) {
    return {
      level: "unscaled",
      ...LEVEL_COPY.unscaled,
      reasons: ["Width in millimetres needs a reference length in the photo."],
      pattern,
    };
  }

  const reasons = [];
  const wide = maxWidthMm > ENGINEER_MIN_MM;
  const aboveHairline = maxWidthMm >= HAIRLINE_MAX_MM;

  if (wide) {
    reasons.push(
      `Maximum width is ${formatMm(maxWidthMm)} mm, over the ${ENGINEER_MIN_MM} mm line.`,
    );
  } else if (aboveHairline) {
    reasons.push(
      `Maximum width is ${formatMm(maxWidthMm)} mm, from ${HAIRLINE_MAX_MM} mm up to ${ENGINEER_MIN_MM} mm.`,
    );
  } else {
    reasons.push(
      `Maximum width is ${formatMm(maxWidthMm)} mm, under ${HAIRLINE_MAX_MM} mm.`,
    );
  }

  if (pattern === "diagonal") {
    reasons.push(
      "The crack runs diagonally. Diagonal cracks can be shear, including from settlement, and are treated more seriously than a straight hairline of the same width.",
    );
  } else if (pattern === "stairstep") {
    reasons.push(
      "The crack stair-steps. In brick and block walls that pattern often follows the mortar because the wall is shifting.",
    );
  } else if (pattern === "along") {
    reasons.push("The crack follows one main direction, not a diagonal or a stair-step.");
  }

  let level = "hairline";
  if (wide || pattern === "diagonal" || pattern === "stairstep") level = "engineer";
  else if (aboveHairline) level = "monitor";

  return {
    level,
    ...LEVEL_COPY[level],
    reasons,
    pattern,
    maxWidthMm,
  };
}

export function rulesSummary() {
  return [
    `Hairline: narrower than ${HAIRLINE_MAX_MM} mm, and not a diagonal or stair-step.`,
    `Monitor: from ${HAIRLINE_MAX_MM} mm to ${ENGINEER_MIN_MM} mm, in a straight pattern.`,
    `See an engineer: wider than ${ENGINEER_MIN_MM} mm, or a diagonal or stair-step pattern at any width.`,
  ];
}
