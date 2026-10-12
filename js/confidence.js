/**
 * Decide whether a crack mask is one coherent crack or texture.
 *
 * Brick mortar, wood grain, foliage, wires and ornamental stucco all leave
 * thin dark lines. Those lines are short, repeated, or pointed every which
 * way. A crack is a long run — one piece, or a few collinear pieces — that
 * stands out from the other marks. When it does, the other marks are dropped.
 */

function labelComponents(mask, width, height) {
  const labels = new Int32Array(width * height);
  const comps = [];
  const qx = new Int16Array(width * height);
  const qy = new Int16Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x;
      if (!mask[start] || labels[start]) continue;
      const id = comps.length + 1;
      let head = 0;
      let tail = 1;
      qx[0] = x;
      qy[0] = y;
      labels[start] = id;

      let area = 0;
      let sumX = 0;
      let sumY = 0;
      let sumXX = 0;
      let sumYY = 0;
      let sumXY = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;

      while (head < tail) {
        const cx = qx[head];
        const cy = qy[head];
        head += 1;
        area += 1;
        sumX += cx;
        sumY += cy;
        sumXX += cx * cx;
        sumYY += cy * cy;
        sumXY += cx * cy;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const ni = ny * width + nx;
            if (!mask[ni] || labels[ni]) continue;
            labels[ni] = id;
            qx[tail] = nx;
            qy[tail] = ny;
            tail += 1;
          }
        }
      }

      const meanX = sumX / area;
      const meanY = sumY / area;
      const xx = sumXX - area * meanX * meanX;
      const yy = sumYY - area * meanY * meanY;
      const xy = sumXY - area * meanX * meanY;
      const trace = xx + yy;
      const det = xx * yy - xy * xy;
      const disc = Math.sqrt(Math.max(0, trace * trace * 0.25 - det));
      const major = trace * 0.5 + disc;
      const minor = Math.max(1e-3, trace * 0.5 - disc);
      let angle = (Math.atan2(2 * xy, xx - yy) * 180) / Math.PI / 2;
      if (angle < 0) angle += 180;

      comps.push({
        id,
        area,
        span: Math.max(1, Math.hypot(maxX - minX, maxY - minY)),
        aspect: Math.sqrt(major / minor),
        angle,
        cx: meanX,
        cy: meanY,
        minX,
        maxX,
        minY,
        maxY,
      });
    }
  }
  return { comps, labels };
}

/** Smallest undirected difference between two line angles, in degrees. */
export function angleGap(a, b) {
  let gap = Math.abs(a - b) % 180;
  if (gap > 90) gap = 180 - gap;
  return gap;
}

function canLink(a, b) {
  if (a.aspect < 2.2 || b.aspect < 2.2) return false;
  if (angleGap(a.angle, b.angle) > 16) return false;
  const rad = ((a.span >= b.span ? a.angle : b.angle) * Math.PI) / 180;
  const ax = Math.cos(rad);
  const ay = Math.sin(rad);
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  const perp = Math.abs(dx * -ay + dy * ax);
  const axial = Math.abs(dx * ax + dy * ay);
  const gap = axial - (a.span + b.span) / 2;
  if (perp > 12) return false;
  if (gap > 42) return false;
  return true;
}

function buildChains(comps) {
  const parent = comps.map((_, index) => index);
  const find = (index) => {
    let cursor = index;
    while (parent[cursor] !== cursor) cursor = parent[cursor];
    return cursor;
  };
  const unite = (left, right) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent[b] = a;
  };
  for (let i = 0; i < comps.length; i++) {
    for (let j = i + 1; j < comps.length; j++) {
      if (canLink(comps[i], comps[j])) unite(i, j);
    }
  }
  const groups = new Map();
  comps.forEach((comp, index) => {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(comp);
  });
  return [...groups.values()].map((members) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let area = 0;
    let angle = members[0].angle;
    let spanPick = 0;
    for (const comp of members) {
      area += comp.area;
      if (comp.span > spanPick) {
        spanPick = comp.span;
        angle = comp.angle;
      }
      if (comp.minX < minX) minX = comp.minX;
      if (comp.maxX > maxX) maxX = comp.maxX;
      if (comp.minY < minY) minY = comp.minY;
      if (comp.maxY > maxY) maxY = comp.maxY;
    }
    return {
      members,
      area,
      angle,
      span: Math.hypot(maxX - minX, maxY - minY),
    };
  });
}

/**
 * @returns {{ accepted: boolean, reason: string, keep: Uint8Array|null, total: number, count: number, ratio: number, coverage: number, longestSpan: number, spread: number, chains: number }}
 */
export function assessCrack(mask, width, height) {
  const { comps } = labelComponents(mask, width, height);
  const total = comps.reduce((sum, comp) => sum + comp.area, 0);
  const coverage = total / (width * height);
  const stats = {
    keep: null,
    total,
    count: comps.length,
    ratio: 0,
    coverage,
    longestSpan: 0,
    spread: 0,
    chains: 0,
    rivals: 0,
  };
  if (!comps.length || total < 40) return { accepted: false, reason: "too few pixels", ...stats };

  const linear = comps.filter((comp) => comp.aspect >= 2.2 && comp.span >= 10);
  const chains = buildChains(linear.length ? linear : comps).sort((a, b) => b.span - a.span);
  const best = chains[0];
  const longEdge = Math.max(width, height);
  const minSpan = Math.max(28, longEdge * 0.07);
  const ratio = best.area / total;
  stats.ratio = ratio;
  stats.longestSpan = best.span;
  stats.chains = chains.length;
  stats.spread = chains.length > 1 ? angleGap(chains[0].angle, chains[1].angle) : 0;

  const rivals = chains.filter(
    (chain, index) => index > 0 && chain.span >= best.span * 0.55 && angleGap(chain.angle, best.angle) <= 14,
  );
  stats.rivals = rivals.length;

  const cross = chains.filter(
    (chain, index) => index > 0 && chain.span >= best.span * 0.4 && angleGap(chain.angle, best.angle) >= 50,
  );

  if (best.span < minSpan) return { accepted: false, reason: "no long crack", ...stats };
  if (rivals.length >= 3) return { accepted: false, reason: "repeated lines", ...stats };
  const strongCross = cross.filter((chain) => chain.span >= best.span * 0.72);
  if (strongCross.length >= 2 && ratio < 0.45) {
    return { accepted: false, reason: "mixed orientation", ...stats };
  }
  if (chains.length >= 10 && ratio < 0.16 && best.span < longEdge * 0.16) {
    return { accepted: false, reason: "fragmented", ...stats };
  }

  return { accepted: true, reason: "crack", ...stats, keep: null };
}
