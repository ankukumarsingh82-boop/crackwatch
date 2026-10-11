import { compareMasks } from "./compare.js";
import { segmentCrack } from "./segment.js";

// The 4.10 jsDelivr build waits on cross-origin isolation and never starts
// in a normal page. The official 4.9 build initialises on its own.
const OPENCV_URLS = ["https://docs.opencv.org/4.9.0/opencv.js"];

let loading = null;

export function loadOpenCv() {
  if (globalThis.cv?.Mat) return Promise.resolve(globalThis.cv);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      let poll = 0;
      const finish = () => {
        if (!globalThis.cv?.Mat) return false;
        clearTimeout(timer);
        clearInterval(poll);
        resolve(globalThis.cv);
        return true;
      };
      const timer = setTimeout(() => {
        clearInterval(poll);
        loading = null;
        reject(new Error("OpenCV.js took too long to start. Check your connection and try again."));
      }, 25000);
      const script = document.createElement("script");
      script.src = OPENCV_URLS[0];
      script.onload = () => {
        if (!finish()) poll = setInterval(finish, 40);
      };
      script.onerror = () => {
        clearTimeout(timer);
        clearInterval(poll);
        script.remove();
        loading = null;
        reject(new Error("OpenCV.js did not load, so the two photos could not be aligned."));
      };
      document.head.appendChild(script);
    });
  }
  return loading;
}

function fitCanvas(source, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasToMat(cv, canvas) {
  return cv.imread(canvas);
}

function maskFromCanvas(canvas, sensitivity) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  return segmentCrack(
    { data: image.data, width: canvas.width, height: canvas.height },
    { sensitivity },
  );
}

/**
 * Align an older photo onto a newer one with ORB features and a RANSAC
 * homography, then compare the two crack masks.
 */
export async function compareGrowth(olderSource, newerSource, sensitivity = 0.55) {
  const cv = await loadOpenCv();
  const olderCanvas = fitCanvas(olderSource, 640);
  const newerCanvas = fitCanvas(newerSource, 640);
  const olderMat = canvasToMat(cv, olderCanvas);
  const newerMat = canvasToMat(cv, newerCanvas);
  const olderGray = new cv.Mat();
  const newerGray = new cv.Mat();
  const olderDesc = new cv.Mat();
  const newerDesc = new cv.Mat();
  const olderKeys = new cv.KeyPointVector();
  const newerKeys = new cv.KeyPointVector();
  const matches = new cv.DMatchVector();
  const empty = new cv.Mat();
  let homography = null;
  let inlierMask = null;
  let warpedMask = null;

  try {
    cv.cvtColor(olderMat, olderGray, cv.COLOR_RGBA2GRAY);
    cv.cvtColor(newerMat, newerGray, cv.COLOR_RGBA2GRAY);
    const orb = new cv.ORB(800);
    orb.detectAndCompute(olderGray, empty, olderKeys, olderDesc);
    orb.detectAndCompute(newerGray, empty, newerKeys, newerDesc);
    orb.delete();

    if (olderDesc.rows < 8 || newerDesc.rows < 8) {
      return { ok: false, message: "Not enough texture to line these photos up. Include some of the wall around the crack." };
    }

    const matcher = new cv.BFMatcher(cv.NORM_HAMMING, true);
    matcher.match(olderDesc, newerDesc, matches);
    matcher.delete();

    const ranked = [];
    for (let i = 0; i < matches.size(); i++) ranked.push(matches.get(i));
    ranked.sort((a, b) => a.distance - b.distance);
    const keep = ranked.slice(0, Math.min(ranked.length, 80)).filter((match, _, arr) => {
      return match.distance < Math.max(48, arr[0].distance * 3);
    });

    if (keep.length < 12) {
      return {
        ok: false,
        message: "These photos don't share enough matching points. Retake them from a similar spot, with the crack and some of the wall in both frames.",
      };
    }

    const src = [];
    const dst = [];
    for (const match of keep) {
      const a = olderKeys.get(match.queryIdx).pt;
      const b = newerKeys.get(match.trainIdx).pt;
      src.push(a.x, a.y);
      dst.push(b.x, b.y);
    }
    const srcMat = cv.matFromArray(keep.length, 1, cv.CV_32FC2, src);
    const dstMat = cv.matFromArray(keep.length, 1, cv.CV_32FC2, dst);
    inlierMask = new cv.Mat();
    homography = cv.findHomography(srcMat, dstMat, cv.RANSAC, 4, inlierMask);
    let inliers = 0;
    for (let i = 0; i < inlierMask.rows; i++) if (inlierMask.data[i]) inliers += 1;
    srcMat.delete();
    dstMat.delete();

    if (!homography || homography.empty() || inliers < 10) {
      return {
        ok: false,
        message: "The photos could not be aligned reliably. Try a pair taken from nearly the same place.",
      };
    }

    const olderSeg = maskFromCanvas(olderCanvas, sensitivity);
    const newerSeg = maskFromCanvas(newerCanvas, sensitivity);
    const olderMaskMat = cv.matFromArray(olderCanvas.height, olderCanvas.width, cv.CV_8UC1, olderSeg.mask);
    warpedMask = new cv.Mat();
    cv.warpPerspective(
      olderMaskMat,
      warpedMask,
      homography,
      new cv.Size(newerCanvas.width, newerCanvas.height),
      cv.INTER_NEAREST,
      cv.BORDER_CONSTANT,
      new cv.Scalar(0),
    );
    olderMaskMat.delete();

    const warped = new Uint8Array(newerCanvas.width * newerCanvas.height);
    warped.set(warpedMask.data);
    const diff = compareMasks(warped, newerSeg.mask, newerCanvas.width, newerCanvas.height);

    return {
      ok: true,
      inliers,
      matches: keep.length,
      width: newerCanvas.width,
      height: newerCanvas.height,
      newerCanvas,
      olderCanvas,
      warpedOlder: warped,
      newerMask: newerSeg.mask,
      ...diff,
    };
  } finally {
    olderMat.delete();
    newerMat.delete();
    olderGray.delete();
    newerGray.delete();
    olderDesc.delete();
    newerDesc.delete();
    olderKeys.delete();
    newerKeys.delete();
    matches.delete();
    empty.delete();
    homography?.delete?.();
    inlierMask?.delete?.();
    warpedMask?.delete?.();
  }
}
