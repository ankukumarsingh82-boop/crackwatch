import { assessCrack } from "./confidence.js";

/**
 * Crack segmentation for a phone photo of a wall, ceiling, pillar or floor.
 *
 * Cracks are thin and darker than the plaster or concrete around them.
 * The pipeline is the classical one used for that shape, not a general
 * vision model:
 *
 * 1. Flatten slow lighting (a crack is a local dip, a shadow is not).
 * 2. Multi-scale black-hat: morphological closing minus the image.
 *    A closing fills dark lines thinner than the structuring element, so
 *    the difference lights up cracks and ignores wide stains.
 * 3. Frangi vesselness (Frangi et al., MICCAI 1998) at two scales.
 *    Cracks are ridges. Blobs of texture are not, and the filter drops them.
 * 4. Hysteresis threshold, a one-pixel closing, then drop components that
 *    are not elongated.
 *
 * `sensitivity` is 0..1. Higher keeps fainter lines.
 */

function percentile(values, p) {
  let max = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] > max) max = values[i];
  }
  if (max <= 0) return 0;
  const bins = 512;
  const hist = new Uint32Array(bins);
  for (let i = 0; i < values.length; i++) {
    let bin = Math.floor((values[i] / max) * (bins - 1));
    if (bin < 0) bin = 0;
    if (bin >= bins) bin = bins - 1;
    hist[bin] += 1;
  }
  const target = Math.max(0, Math.min(values.length - 1, Math.round(p * (values.length - 1))));
  let seen = 0;
  for (let bin = 0; bin < bins; bin++) {
    seen += hist[bin];
    if (seen > target) return (bin / (bins - 1)) * max;
  }
  return max;
}

function slidingMax(src, radius) {
  const n = src.length;
  const out = new Float32Array(n);
  if (radius <= 0) {
    out.set(src);
    return out;
  }
  const paddedLength = n + 2 * radius;
  const padded = new Float32Array(paddedLength);
  for (let i = 0; i < paddedLength; i++) {
    const j = Math.min(n - 1, Math.max(0, i - radius));
    padded[i] = src[j];
  }
  const deque = new Int32Array(paddedLength);
  let head = 0;
  let tail = 0;
  const window = 2 * radius + 1;
  for (let i = 0; i < paddedLength; i++) {
    while (head < tail && deque[head] <= i - window) head += 1;
    while (head < tail && padded[deque[tail - 1]] <= padded[i]) tail -= 1;
    deque[tail] = i;
    tail += 1;
    if (i >= window - 1) {
      const original = i - radius - radius;
      if (original >= 0 && original < n) out[original] = padded[deque[head]];
    }
  }
  return out;
}

function filterRows(src, width, height, radius, negate) {
  const tmp = new Float32Array(width * height);
  const row = new Float32Array(width);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = src[y * width + x];
      row[x] = negate ? -value : value;
    }
    const filtered = slidingMax(row, radius);
    for (let x = 0; x < width; x++) {
      tmp[y * width + x] = negate ? -filtered[x] : filtered[x];
    }
  }
  return tmp;
}

function filterCols(src, width, height, radius, negate) {
  const out = new Float32Array(width * height);
  const column = new Float32Array(height);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const value = src[y * width + x];
      column[y] = negate ? -value : value;
    }
    const filtered = slidingMax(column, radius);
    for (let y = 0; y < height; y++) {
      out[y * width + x] = negate ? -filtered[y] : filtered[y];
    }
  }
  return out;
}

function maxFilter2D(src, width, height, radius) {
  return filterCols(filterRows(src, width, height, radius, false), width, height, radius, false);
}

function minFilter2D(src, width, height, radius) {
  return filterCols(filterRows(src, width, height, radius, true), width, height, radius, true);
}

function blackHat(src, width, height, radius) {
  const closed = minFilter2D(maxFilter2D(src, width, height, radius), width, height, radius);
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) out[i] = Math.max(0, closed[i] - src[i]);
  return out;
}

function boxBlurSmall(src, width, height) {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let acc = 0;
      let n = 0;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= width) continue;
        acc += src[y * width + xx];
        n += 1;
      }
      tmp[y * width + x] = acc / n;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let acc = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        acc += tmp[yy * width + x];
        n += 1;
      }
      out[y * width + x] = acc / n;
    }
  }
  return out;
}

function flattenIllumination(gray, width, height) {
  const step = 8;
  const smallW = Math.ceil(width / step);
  const smallH = Math.ceil(height / step);
  const small = new Float32Array(smallW * smallH);
  const count = new Float32Array(smallW * smallH);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(smallH - 1, Math.floor(y / step));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(smallW - 1, Math.floor(x / step));
      const index = sy * smallW + sx;
      small[index] += gray[y * width + x];
      count[index] += 1;
    }
  }
  for (let i = 0; i < small.length; i++) {
    small[i] = count[i] ? small[i] / count[i] : 0;
  }
  let blur = small;
  for (let pass = 0; pass < 2; pass++) blur = boxBlurSmall(blur, smallW, smallH);

  const flat = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const gy = Math.min(smallH - 1, Math.max(0, y / step - 0.5));
    const y0 = Math.min(smallH - 1, Math.max(0, Math.floor(gy)));
    const y1 = Math.min(smallH - 1, y0 + 1);
    const ty = gy - y0;
    for (let x = 0; x < width; x++) {
      const gx = Math.min(smallW - 1, Math.max(0, x / step - 0.5));
      const x0 = Math.min(smallW - 1, Math.max(0, Math.floor(gx)));
      const x1 = Math.min(smallW - 1, x0 + 1);
      const tx = gx - x0;
      const sample =
        blur[y0 * smallW + x0] * (1 - tx) * (1 - ty) +
        blur[y0 * smallW + x1] * tx * (1 - ty) +
        blur[y1 * smallW + x0] * (1 - tx) * ty +
        blur[y1 * smallW + x1] * tx * ty;
      const base = Math.max(0.08, sample);
      flat[y * width + x] = Math.min(1.8, gray[y * width + x] / base);
    }
  }
  return flat;
}

function gaussianKernel(sigma) {
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel = new Float32Array(radius * 2 + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const value = Math.exp((-0.5 * i * i) / (sigma * sigma));
    kernel[i + radius] = value;
    sum += value;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;
  return kernel;
}

function blurSeparable(src, width, height, sigma) {
  const kernel = gaussianKernel(sigma);
  const radius = (kernel.length - 1) >> 1;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = Math.min(width - 1, Math.max(0, x + k));
        acc += src[y * width + xx] * kernel[k + radius];
      }
      tmp[y * width + x] = acc;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = Math.min(height - 1, Math.max(0, y + k));
        acc += tmp[yy * width + x] * kernel[k + radius];
      }
      out[y * width + x] = acc;
    }
  }
  return out;
}

function sample(src, width, height, x, y) {
  const xx = Math.min(width - 1, Math.max(0, x));
  const yy = Math.min(height - 1, Math.max(0, y));
  return src[yy * width + xx];
}

/** Frangi vesselness for bright ridges. `src` should already be a float image. */
function frangi(src, width, height, sigma) {
  const blurred = blurSeparable(src, width, height, sigma);
  const n = width * height;
  const strength = new Float32Array(n);
  const lambda2 = new Float32Array(n);
  const rb = new Float32Array(n);
  const scale = sigma * sigma;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const center = sample(blurred, width, height, x, y);
      const ixx = scale * (sample(blurred, width, height, x + 1, y) - 2 * center + sample(blurred, width, height, x - 1, y));
      const iyy = scale * (sample(blurred, width, height, x, y + 1) - 2 * center + sample(blurred, width, height, x, y - 1));
      const ixy =
        scale *
        0.25 *
        (sample(blurred, width, height, x + 1, y + 1) -
          sample(blurred, width, height, x - 1, y + 1) -
          sample(blurred, width, height, x + 1, y - 1) +
          sample(blurred, width, height, x - 1, y - 1));
      const diff = ixx - iyy;
      const disc = Math.sqrt(Math.max(0, diff * diff + 4 * ixy * ixy));
      let l1 = 0.5 * (ixx + iyy + disc);
      let l2 = 0.5 * (ixx + iyy - disc);
      if (Math.abs(l1) > Math.abs(l2)) {
        const swap = l1;
        l1 = l2;
        l2 = swap;
      }
      const index = y * width + x;
      lambda2[index] = l2;
      strength[index] = Math.hypot(l1, l2);
      rb[index] = Math.abs(l2) > 1e-8 ? Math.abs(l1) / Math.abs(l2) : 0;
    }
  }

  const c = Math.max(1e-6, 0.5 * percentile(strength, 0.99));
  const beta = 0.5;
  const out = new Float32Array(n);
  const twoBeta = 2 * beta * beta;
  const twoC = 2 * c * c;
  for (let i = 0; i < n; i++) {
    if (lambda2[i] >= 0) continue;
    const blob = Math.exp(-(rb[i] * rb[i]) / twoBeta);
    const energy = 1 - Math.exp(-(strength[i] * strength[i]) / twoC);
    out[i] = blob * energy;
  }
  return out;
}

function normalise(src) {
  const scale = percentile(src, 0.995);
  const out = new Float32Array(src.length);
  if (scale <= 1e-8) return out;
  for (let i = 0; i < src.length; i++) out[i] = Math.min(1, src[i] / scale);
  return out;
}

function hysteresis(score, width, height, low, high) {
  const mask = new Uint8Array(width * height);
  const qx = new Int32Array(width * height);
  const qy = new Int32Array(width * height);
  let tail = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (score[y * width + x] >= high) {
        mask[y * width + x] = 1;
        qx[tail] = x;
        qy[tail] = y;
        tail += 1;
      }
    }
  }
  let head = 0;
  while (head < tail) {
    const x = qx[head];
    const y = qy[head];
    head += 1;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const index = ny * width + nx;
        if (mask[index] || score[index] < low) continue;
        mask[index] = 1;
        qx[tail] = nx;
        qy[tail] = ny;
        tail += 1;
      }
    }
  }
  return mask;
}

function binaryClose(mask, width, height) {
  const dilated = new Uint8Array(mask.length);
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
      dilated[y * width + x] = on;
    }
  }
  const closed = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let on = 1;
      for (let dy = -1; dy <= 1 && on; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            on = 0;
            break;
          }
          if (!dilated[ny * width + nx]) on = 0;
        }
      }
      closed[y * width + x] = on;
    }
  }
  return closed;
}

function keepElongated(mask, width, height) {
  const labels = new Int32Array(width * height);
  const qx = new Int32Array(width * height);
  const qy = new Int32Array(width * height);
  const kept = new Uint8Array(width * height);
  const minArea = Math.max(18, Math.round(width * height * 0.00005));
  let next = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x;
      if (!mask[start] || labels[start]) continue;
      next += 1;
      let head = 0;
      let tail = 0;
      qx[tail] = x;
      qy[tail] = y;
      tail += 1;
      labels[start] = next;

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
      let border = 0;

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
        if (cx < 3 || cy < 3 || cx >= width - 3 || cy >= height - 3) border += 1;

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const ni = ny * width + nx;
            if (!mask[ni] || labels[ni]) continue;
            labels[ni] = next;
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
      const aspect = Math.sqrt(major / minor);
      const span = Math.max(1, Math.hypot(maxX - minX, maxY - minY));
      const thickness = area / span;
      const borderShare = border / area;
      const tooThick = thickness > 14 && aspect < 5;
      const edgeClutter = borderShare > 0.55 && aspect < 8;
      const elongated =
        (aspect >= 3.1 && span >= 16) ||
        (aspect >= 2.4 && thickness < 6 && area >= minArea * 2 && span >= 16);
      if (area < minArea || tooThick || edgeClutter || !elongated) continue;

      head = 0;
      tail = 0;
      qx[0] = x;
      qy[0] = y;
      tail = 1;
      const seen = new Uint8Array(width * height);
      seen[start] = 1;
      while (head < tail) {
        const cx = qx[head];
        const cy = qy[head];
        head += 1;
        if (labels[cy * width + cx] === next) kept[cy * width + cx] = 1;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const ni = ny * width + nx;
            if (seen[ni] || labels[ni] !== next) continue;
            seen[ni] = 1;
            qx[tail] = nx;
            qy[tail] = ny;
            tail += 1;
          }
        }
      }
    }
  }
  return kept;
}

function countMask(mask) {
  let n = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) n += 1;
  return n;
}

function thresholdScore(score, width, height, sensitivity) {
  const peak = percentile(score, 0.998);
  if (peak < 0.02) return new Uint8Array(width * height);
  const clamped = Math.min(1, Math.max(0, sensitivity));
  const high = peak * (0.62 - 0.28 * clamped);
  const low = high * 0.5;
  const mask = hysteresis(score, width, height, low, high);
  return keepElongated(binaryClose(mask, width, height), width, height);
}


function toGray(image, invert) {
  const { data, width, height } = image;
  const gray = new Float32Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    const luminance = (0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]) / 255;
    gray[i] = invert ? 1 - luminance : luminance;
  }
  return gray;
}

/**
 * @param {{ data: Uint8ClampedArray|Uint8Array, width: number, height: number }} image RGBA
 * @param {{ sensitivity?: number, invert?: boolean }} [options]
 */
export function segmentCrack(image, options = {}) {
  const sensitivity = options.sensitivity ?? 0.55;
  const width = image.width;
  const height = image.height;
  const gray = toGray(image, Boolean(options.invert));
  const flat = flattenIllumination(gray, width, height);

  const radii = [1, 2, 4, 7];
  let hat = blackHat(flat, width, height, radii[0]);
  for (let r = 1; r < radii.length; r++) {
    const layer = blackHat(flat, width, height, radii[r]);
    for (let i = 0; i < hat.length; i++) if (layer[i] > hat[i]) hat[i] = layer[i];
  }
  const hatN = normalise(hat);

  const ridges = new Float32Array(width * height);
  for (let i = 0; i < ridges.length; i++) ridges[i] = -flat[i];
  const fine = frangi(ridges, width, height, 0.9);
  const coarse = frangi(ridges, width, height, 1.8);
  const vessel = new Float32Array(width * height);
  for (let i = 0; i < vessel.length; i++) vessel[i] = Math.max(fine[i], coarse[i]);
  const vesselN = normalise(vessel);

  const combined = new Float32Array(width * height);
  for (let i = 0; i < combined.length; i++) {
    combined[i] = Math.sqrt(hatN[i] * vesselN[i]) * 0.75 + hatN[i] * 0.25;
  }

  let mask = thresholdScore(combined, width, height, sensitivity);
  let mode = "blackhat+frangi";
  if (countMask(mask) < 20) {
    mask = thresholdScore(hatN, width, height, Math.max(0.15, sensitivity - 0.15));
    mode = "blackhat";
  }

  const verdict = assessCrack(mask, width, height);
  if (!verdict.accepted) mask = new Uint8Array(width * height);

  return {
    mask,
    gray: flat,
    width,
    height,
    pixels: countMask(mask),
    mode,
    accepted: verdict.accepted,
    verdict,
  };
}

/** Downscale RGBA with a simple box filter. `image` is {data,width,height}. */
export function downscaleImage(image, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  if (scale === 1) return image;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const data = new Uint8ClampedArray(width * height * 4);
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
  return { data, width, height, scale };
}
