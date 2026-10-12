import { dilateMask } from "./measure.js";

/**
 * Compare two aligned crack masks of the same size.
 * A one-pixel dilation absorbs small alignment error so a stable crack
 * is not reported as growth.
 */
export function compareMasks(olderMask, newerMask, width, height) {
  const olderNear = dilateMask(olderMask, width, height);
  const newerNear = dilateMask(newerMask, width, height);
  const growthMask = new Uint8Array(width * height);
  let growth = 0;
  let shrink = 0;
  let both = 0;
  let olderCount = 0;
  let newerCount = 0;

  for (let i = 0; i < olderMask.length; i++) {
    if (olderMask[i]) olderCount += 1;
    if (newerMask[i]) newerCount += 1;
    if (olderMask[i] && newerMask[i]) both += 1;
    if (newerMask[i] && !olderNear[i]) {
      growth += 1;
      growthMask[i] = 1;
    } else if (olderMask[i] && !newerNear[i]) {
      shrink += 1;
    }
  }

  const newerExtent = both + growth;
  const grew = growth >= 24 && growth > 0.12 * Math.max(newerExtent, 1);
  const shrank = shrink >= 24 && shrink > 0.12 * Math.max(olderCount, 1);

  return {
    growth,
    shrink,
    both,
    olderCount,
    newerCount,
    growthMask,
    grew,
    shrank,
  };
}
