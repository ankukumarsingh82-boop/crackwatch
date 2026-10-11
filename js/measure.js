/**
 * Crack measurement in pixel space.
 *
 * Length comes from a Zhang–Suen skeleton. Each skeleton edge is counted
 * once; diagonal steps contribute √2 so a slanted crack is not short-changed.
 *
 * Width comes from the exact Euclidean distance transform (Felzenszwalb &
 * Huttenlocher 2012). The distance is measured from a crack pixel to the
 * nearest background pixel centre, then 0.5 px is removed because the crack
 * boundary sits halfway between those centres. Full width is twice that
 * radius, read along the skeleton (the medial axis).
 */

const INF = 1e8;

/**
 * Squared distance transform of a 1D sampled function.
 * f[i] is 0 on background and a large number on foreground.
 */
function distanceTransform1D(f) {
  const n = f.length;
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s =
      (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k -= 1;
      if (k < 0) {
        k = 0;
        break;
      }
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k += 1;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k += 1;
    const dx = q - v[k];
    d[q] = dx * dx + f[v[k]];
  }
  return d;
}

/**
 * Euclidean distance from every foreground pixel to the nearest background
 * pixel. Background pixels are 0. `mask` is 0/1.
 */
export function euclideanDistanceTransform(mask, width, height) {
  const tmp = new Float64Array(width * height);
  const column = new Float64Array(height);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      column[y] = mask[y * width + x] ? INF : 0;
    }
    const transformed = distanceTransform1D(column);
    for (let y = 0; y < height; y++) tmp[y * width + x] = transformed[y];
  }

  const distance = new Float32Array(width * height);
  const row = new Float64Array(width);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) row[x] = tmp[y * width + x];
    const transformed = distanceTransform1D(row);
    for (let x = 0; x < width; x++) {
      distance[y * width + x] = Math.sqrt(Math.max(0, transformed[x]));
    }
  }
  return distance;
}

/**
 * Zhang–Suen thinning. Foreground pixels are 1. Returns a new mask.
 * T. Y. Zhang and C. Y. Suen, CACM 1984.
 */
export function zhangSuenThinning(input, width, height) {
  const mask = Uint8Array.from(input, (value) => (value ? 1 : 0));
  const marked = [];
  let changed = true;
  let guard = 0;

  while (changed && guard < 64) {
    changed = false;
    guard += 1;
    for (let pass = 0; pass < 2; pass++) {
      marked.length = 0;
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const i = y * width + x;
          if (!mask[i]) continue;
          const p2 = mask[i - width];
          const p3 = mask[i - width + 1];
          const p4 = mask[i + 1];
          const p5 = mask[i + width + 1];
          const p6 = mask[i + width];
          const p7 = mask[i + width - 1];
          const p8 = mask[i - 1];
          const p9 = mask[i - width - 1];
          const neighbors = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (neighbors < 2 || neighbors > 6) continue;
          const ring = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
          let transitions = 0;
          for (let k = 0; k < 8; k++) {
            if (ring[k] === 0 && ring[k + 1] === 1) transitions += 1;
          }
          if (transitions !== 1) continue;
          if (pass === 0) {
            if (p2 && p4 && p6) continue;
            if (p4 && p6 && p8) continue;
          } else if ((p2 && p4 && p8) || (p2 && p6 && p8)) {
            continue;
          }
          marked.push(i);
        }
      }
      if (marked.length) {
        changed = true;
        for (const index of marked) mask[index] = 0;
      }
    }
  }
  return mask;
}

/** Centreline length. Orthogonal steps count as 1 px, diagonal steps as √2. */
export function skeletonLengthPx(skeleton, width, height) {
  let length = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!skeleton[y * width + x]) continue;
      if (x + 1 < width && skeleton[y * width + x + 1]) length += 1;
      if (y + 1 < height && skeleton[(y + 1) * width + x]) length += 1;
      if (x + 1 < width && y + 1 < height && skeleton[(y + 1) * width + x + 1]) {
        length += Math.SQRT2;
      }
      if (x - 1 >= 0 && y + 1 < height && skeleton[(y + 1) * width + x - 1]) {
        length += Math.SQRT2;
      }
    }
  }
  return length;
}

function widthAt(distance) {
  return Math.max(0, distance - 0.5) * 2;
}

/**
 * Maximum and mean crack width in pixels. Mean is taken on the medial axis
 * so the thin edges of the mask do not pull it down.
 */
export function crackWidthPx(mask, width, height, skeleton = null) {
  const distance = euclideanDistanceTransform(mask, width, height);
  const axis = skeleton ?? zhangSuenThinning(mask, width, height);
  let max = 0;
  let sum = 0;
  let count = 0;
  let axisCount = 0;

  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const crackWidth = widthAt(distance[i]);
    if (crackWidth > max) max = crackWidth;
  }

  for (let i = 0; i < axis.length; i++) {
    if (!axis[i]) continue;
    axisCount += 1;
    const crackWidth = widthAt(distance[i] || 0);
    sum += crackWidth;
    count += 1;
  }

  if (!count) {
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      sum += widthAt(distance[i]);
      count += 1;
    }
  }

  return {
    max,
    mean: count ? sum / count : 0,
    distance,
    skeletonPixels: axisCount,
  };
}

export function pixelsToMillimetres(pixels, mmPerPx) {
  if (mmPerPx == null || Number.isNaN(mmPerPx)) return null;
  return pixels * mmPerPx;
}

/**
 * Measure one binary crack mask.
 * `mmPerPx` is millimetres per pixel in *this mask's* coordinate system.
 */
function bilinear(gray, width, height, x, y) {
  if (x < 0 || y < 0 || x > width - 1 || y > height - 1) return 1;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const i00 = gray[y0 * width + x0];
  const i10 = gray[y0 * width + x1];
  const i01 = gray[y1 * width + x0];
  const i11 = gray[y1 * width + x1];
  return i00 * (1 - tx) * (1 - ty) + i10 * tx * (1 - ty) + i01 * (1 - tx) * ty + i11 * tx * ty;
}

/**
 * Width from the dark dip across the centreline, not from how thick the
 * binary mask got. Half-depth width: how far the line stays darker than
 * halfway between its darkest point and the plaster beside it.
 */
export function profileWidthPx(gray, skeleton, width, height) {
  const found = [];
  const reach = 12;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (!skeleton[y * width + x]) continue;
      let dx = 0;
      let dy = 0;
      let links = 0;
      for (let ny = y - 1; ny <= y + 1 && !links; ny++) {
        for (let nx = x - 1; nx <= x + 1; nx++) {
          if (nx === x && ny === y) continue;
          if (!skeleton[ny * width + nx]) continue;
          // One neighbour is enough. Summing both ends of a straight
          // crack cancels the tangent and the width is measured along it.
          dx = nx - x;
          dy = ny - y;
          links = 1;
          break;
        }
      }
      if (!links) continue;
      const norm = Math.hypot(dx, dy) || 1;
      const px = -dy / norm;
      const py = dx / norm;
      const samples = new Float32Array(reach * 2 + 1);
      for (let t = -reach; t <= reach; t++) {
        samples[t + reach] = bilinear(gray, width, height, x + px * t, y + py * t);
      }
      const center = samples[reach];
      let background = center;
      for (let i = 0; i < 4; i++) {
        background = Math.max(background, samples[i], samples[samples.length - 1 - i]);
      }
      if (background - center < 0.03) continue;
      const half = center + 0.5 * (background - center);
      let left = reach;
      while (left > 0 && samples[left - 1] <= half) left -= 1;
      let right = reach;
      while (right < samples.length - 1 && samples[right + 1] <= half) right += 1;
      const crackWidth = right - left;
      if (crackWidth >= 1 && crackWidth <= reach * 2) found.push(crackWidth);
    }
  }
  if (!found.length) return { max: 0, mean: 0, count: 0 };
  found.sort((a, b) => a - b);
  const at = (p) => found[Math.min(found.length - 1, Math.floor(found.length * p))];
  const sum = found.reduce((total, value) => total + value, 0);
  return {
    max: at(0.9),
    mean: sum / found.length,
    median: at(0.5),
    count: found.length,
  };
}

export function measureCrack(mask, width, height, mmPerPx = null, gray = null) {
  const skeleton = zhangSuenThinning(mask, width, height);
  const lengthPx = skeletonLengthPx(skeleton, width, height);
  const geometric = crackWidthPx(mask, width, height, skeleton);
  const profile = gray ? profileWidthPx(gray, skeleton, width, height) : null;
  const maxWidthPx = profile && profile.count >= 5 ? profile.max : geometric.max;
  const meanWidthPx = profile && profile.count >= 5 ? profile.mean : geometric.mean;
  const medianWidthPx = profile && profile.count >= 5 ? profile.median : geometric.mean;
  return {
    skeleton,
    lengthPx,
    maxWidthPx,
    meanWidthPx,
    medianWidthPx,
    widthSource: profile && profile.count >= 5 ? "profile" : "mask",
    lengthMm: pixelsToMillimetres(lengthPx, mmPerPx),
    maxWidthMm: pixelsToMillimetres(maxWidthPx, mmPerPx),
    meanWidthMm: pixelsToMillimetres(meanWidthPx, mmPerPx),
  };
}

/** 8-connected dilation by one pixel. */
export function dilateMask(mask, width, height) {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let on = 0;
      for (let dy = -1; dy <= 1 && !on; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (mask[ny * width + nx]) on = 1;
        }
      }
      out[y * width + x] = on;
    }
  }
  return out;
}
