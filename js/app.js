import { measureCrack } from "./measure.js";
import { NO_CRACK_RESULT, classifyRisk, detectPattern, rulesSummary, scaleAllowsRating } from "./risk.js";
import { segmentCrack } from "./segment.js";
import { compareGrowth } from "./growth.js";
import { SAMPLES } from "./samples.js";

const $ = (id) => document.getElementById(id);

const canvas = $("photo");
const ctx = canvas.getContext("2d");
const PATTERN_LABEL = {
  along: "Mostly straight",
  diagonal: "Diagonal",
  stairstep: "Stair-step",
  unclear: "Unclear",
};

const state = {
  display: null,
  segmentation: null,
  measured: null,
  pattern: null,
  risk: null,
  sensitivity: 0.55,
  invert: false,
  showMask: true,
  scale: null,
  points: [],
  armed: false,
  referenceMm: 27,
  credit: "",
  busy: false,
  demoScale: null,
  sourceWidth: 0,
  sourceHeight: 0,
};

const older = { image: null };
const newer = { image: null };

function formatMm(value) {
  if (value == null || Number.isNaN(value)) return "—";
  if (value >= 10) return `${value.toFixed(0)} mm`;
  if (value >= 1) return `${value.toFixed(1)} mm`;
  return `${value.toFixed(2)} mm`;
}

function knownMillimetres() {
  if ($("reference").value === "custom") return Number($("custom-mm").value);
  return Number($("reference").value);
}

function setStatus(text) {
  const node = $("status");
  node.hidden = !text;
  node.textContent = text || "";
}

function fitSize(width, height, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This photo could not be opened. Try a JPEG or PNG."));
    };
    image.src = url;
  });
}

async function loadImage(image, credit, demoScale = null) {
  state.credit = credit || "";
  state.points = [];
  state.scale = null;
  state.armed = false;
  state.demoScale = demoScale;
  state.sourceWidth = image.naturalWidth || image.width;
  state.sourceHeight = image.naturalHeight || image.height;
  $("use-demo").hidden = true;
  $("scale-note").textContent = demoScale
    ? "Synthetic sample, not a photograph. The disc is drawn and is not detected. Apply the 27 mm scale, or tap the two sides of the disc yourself."
    : "No scale set. Add a coin or tap a known length for a risk rating.";
  const size = fitSize(image.naturalWidth || image.width, image.naturalHeight || image.height, 1400);
  const display = document.createElement("canvas");
  display.width = size.width;
  display.height = size.height;
  display.getContext("2d").drawImage(image, 0, 0, size.width, size.height);
  state.display = display;
  $("drop").classList.add("has-photo");
  canvas.classList.add("ready");
  $("empty").hidden = true;
  $("credit-line").textContent = credit || "";
  await analyse();
  $("use-demo").hidden = !state.demoScale;
}

function procImage() {
  const size = fitSize(state.display.width, state.display.height, 720);
  const proc = document.createElement("canvas");
  proc.width = size.width;
  proc.height = size.height;
  const context = proc.getContext("2d", { willReadFrequently: true });
  context.drawImage(state.display, 0, 0, size.width, size.height);
  return { proc, image: context.getImageData(0, 0, size.width, size.height) };
}

let analyseQueued = false;

async function analyse() {
  if (!state.display) return;
  if (state.busy) {
    analyseQueued = true;
    return;
  }
  state.busy = true;
  setStatus("Reading the crack…");
  $("save").disabled = true;
  await new Promise((resolve) => setTimeout(resolve, 30));
  try {
    const { image } = procImage();
    const segmentation = segmentCrack(
      { data: image.data, width: image.width, height: image.height },
      { sensitivity: state.sensitivity, invert: state.invert },
    );
    const measured = measureCrack(
      segmentation.mask,
      segmentation.width,
      segmentation.height,
      null,
      segmentation.gray,
    );
    state.segmentation = segmentation;
    state.measured = measured;
    state.pattern = detectPattern(measured.skeleton, segmentation.width, segmentation.height);
    publish();
  } catch (error) {
    setStatus(error.message || "The photo could not be read.");
  } finally {
    state.busy = false;
    setStatus("");
    if (analyseQueued) {
      analyseQueued = false;
      analyse();
    }
  }
}

function scaled(px) {
  if (!scaleAllowsRating(state.scale?.mode) || !state.segmentation || state.scale.mmPerPx == null) return null;
  const factor = canvas.width / state.segmentation.width;
  return px * factor * state.scale.mmPerPx;
}

function publish() {
  const segmentation = state.segmentation;
  const measured = state.measured;
  if (!segmentation || !measured) return;

  const rejected = segmentation.accepted === false || segmentation.pixels < 30;
  const maxWidthMm = rejected ? null : scaled(measured.maxWidthPx);
  const typicalMm = rejected ? null : scaled(measured.medianWidthPx);
  const lengthMm = rejected ? null : scaled(measured.lengthPx);
  state.risk = rejected
    ? NO_CRACK_RESULT
    : classifyRisk({ maxWidthMm, pattern: state.pattern.pattern });

  const badge = $("badge");
  badge.className = `badge badge-${state.risk.level}`;
  $("badge-title").textContent = state.risk.title;
  $("badge-summary").textContent = state.risk.summary;
  const edge = Math.max(segmentation.width, segmentation.height);
  $("stat-length").textContent = rejected ? "—" : lengthMm == null ? `${Math.round(measured.lengthPx)} px` : formatMm(lengthMm);
  $("stat-typical").textContent = rejected ? "—" : typicalMm == null ? `${measured.medianWidthPx.toFixed(1)} px` : formatMm(typicalMm);
  $("stat-width").textContent = rejected
    ? "—"
    : maxWidthMm == null
      ? `${measured.maxWidthPx.toFixed(1)} px`
      : formatMm(maxWidthMm);
  $("stat-pattern").textContent = rejected ? "—" : PATTERN_LABEL[state.pattern.pattern] || "Unclear";
  $("pattern-line").textContent = rejected ? "" : state.pattern.summary || "";

  const reasons = $("reasons");
  reasons.replaceChildren();
  for (const reason of state.risk.reasons) {
    const item = document.createElement("li");
    item.textContent = reason;
    reasons.appendChild(item);
  }
  if (!rejected && maxWidthMm == null && measured.lengthPx) {
    const item = document.createElement("li");
    const share = (measured.maxWidthPx / edge) * 100;
    item.textContent = `Length is ${Math.round(measured.lengthPx)} px. The widest point is ${measured.maxWidthPx.toFixed(1)} px, about ${share.toFixed(1)}% of the long edge. Add a coin or tap a known length for a risk rating.`;
    reasons.appendChild(item);
  }
  draw();
  $("save").disabled = false;
  canvas.setAttribute("aria-label", `Photo. Rating: ${state.risk.title}.`);
}

function draw() {
  if (!state.display) return;
  canvas.width = state.display.width;
  canvas.height = state.display.height;
  ctx.drawImage(state.display, 0, 0);
  if (state.showMask && state.segmentation?.pixels) {
    const maskCanvas = maskOverlay(state.segmentation, colorFor(state.risk?.level));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(maskCanvas, 0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
  }
  drawScale();
}

function colorFor(level) {
  if (level === "hairline") return [28, 110, 72];
  if (level === "monitor") return [154, 96, 12];
  if (level === "engineer") return [176, 52, 32];
  return [176, 52, 32];
}

function maskOverlay(segmentation, [red, green, blue]) {
  const { mask, width, height } = segmentation;
  const overlay = document.createElement("canvas");
  overlay.width = width;
  overlay.height = height;
  const context = overlay.getContext("2d");
  const image = context.createImageData(width, height);
  const data = image.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (!mask[index]) continue;
      let edge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      if (!edge) {
        edge = !mask[index - 1] || !mask[index + 1] || !mask[index - width] || !mask[index + width];
      }
      const pixel = index * 4;
      data[pixel] = red;
      data[pixel + 1] = green;
      data[pixel + 2] = blue;
      data[pixel + 3] = edge ? 230 : 110;
    }
  }
  context.putImageData(image, 0, 0);
  return overlay;
}

function drawScale() {
  if (state.points.length === 0) return;
  ctx.save();
  ctx.strokeStyle = "#9d341f";
  ctx.fillStyle = "#9d341f";
  ctx.lineWidth = Math.max(2, canvas.width / 420);
  for (const point of state.points) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, Math.max(5, canvas.width / 180), 0, Math.PI * 2);
    ctx.fill();
  }
  if (state.points.length === 2) {
    const [a, b] = state.points;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    const label = `${knownMillimetres()} mm`;
    ctx.font = `${Math.max(16, canvas.width / 48)}px Outfit, sans-serif`;
    ctx.fillText(label, (a.x + b.x) / 2 + 8, (a.y + b.y) / 2 - 8);
  }
  ctx.restore();
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) * canvas.width) / rect.width,
    y: ((event.clientY - rect.top) * canvas.height) / rect.height,
  };
}

function applyPointScale() {
  if (state.points.length < 2) return;
  const [a, b] = state.points;
  const distance = Math.hypot(a.x - b.x, a.y - b.y);
  const mm = knownMillimetres();
  if (!distance || !mm || mm <= 0) return;
  state.scale = {
    mode: "points",
    mmPerPx: mm / distance,
    label: `${mm} mm across the two points`,
  };
  $("scale-note").textContent = state.scale.label;
  if (state.measured) publish();
}

function setIllustrative() {
  if (!state.display || !canvas.width) return;
  state.scale = {
    mode: "illustrative",
    mmPerPx: null,
    label: "Pixels only. Add a coin or tap a known length for a risk rating.",
  };
  state.points = [];
  state.armed = false;
  canvas.classList.remove("armed");
  $("scale-note").textContent = state.scale.label;
  if (state.measured) publish();
}

function applyDemoScale() {
  const demo = state.demoScale;
  if (!demo || !state.sourceWidth || !canvas.width) return;
  const sx = canvas.width / state.sourceWidth;
  const sy = canvas.height / state.sourceHeight;
  $("reference").value = "27";
  $("custom-wrap").hidden = true;
  state.referenceMm = 27;
  state.points = [
    { x: demo.x1 * sx, y: demo.y1 * sy },
    { x: demo.x2 * sx, y: demo.y2 * sy },
  ];
  state.armed = false;
  canvas.classList.remove("armed");
  applyPointScale();
}

function renderSamples() {
  const root = $("samples");
  for (const sample of SAMPLES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sample";
    button.dataset.id = sample.id;
    const img = document.createElement("img");
    img.src = sample.src;
    img.alt = sample.title;
    const title = document.createElement("strong");
    title.textContent = sample.title;
    const note = document.createElement("span");
    note.textContent = sample.note;
    const credit = document.createElement("span");
    credit.className = "fine";
    credit.textContent = `${sample.credit} · ${sample.license}`;
    button.append(img, title, note, credit);
    button.addEventListener("click", () => {
      document.querySelectorAll(".sample").forEach((node) => node.classList.remove("selected"));
      button.classList.add("selected");
      openSample(sample);
    });
    root.appendChild(button);
  }
}

function renderRules() {
  const list = $("rules");
  for (const rule of rulesSummary()) {
    const item = document.createElement("li");
    item.textContent = rule;
    list.appendChild(item);
  }
}

async function onFile(file) {
  if (!file) return;
  document.querySelectorAll(".sample").forEach((node) => node.classList.remove("selected"));
  try {
    const image = await readFile(file);
    await loadImage(image, "Your photo. Nothing was uploaded.");
  } catch (error) {
    setStatus(error.message);
  }
}

function wireScale() {
  $("reference").addEventListener("change", () => {
    const custom = $("reference").value === "custom";
    $("custom-wrap").hidden = !custom;
    state.referenceMm = knownMillimetres();
    if (state.points.length === 2) applyPointScale();
  });
  $("custom-mm").addEventListener("change", () => {
    if (state.points.length === 2) applyPointScale();
  });
  $("arm-scale").addEventListener("click", () => {
    if (!state.display) return;
    state.armed = true;
    state.points = [];
    state.scale = null;
    canvas.classList.add("armed");
    $("scale-note").textContent = "Tap one end of the reference, then the other.";
    draw();
  });
  $("use-demo").addEventListener("click", applyDemoScale);
  $("illustrative").addEventListener("click", setIllustrative);
  $("clear-scale").addEventListener("click", () => {
    state.scale = null;
    state.points = [];
    state.armed = false;
    canvas.classList.remove("armed");
    $("scale-note").textContent = "No scale set.";
    if (state.measured) publish();
  });
  canvas.addEventListener("pointerdown", (event) => {
    if (!state.armed) return;
    event.preventDefault();
    state.points.push(canvasPoint(event));
    if (state.points.length >= 2) {
      state.points = state.points.slice(-2);
      state.armed = false;
      canvas.classList.remove("armed");
      applyPointScale();
    } else {
      $("scale-note").textContent = "Tap the other end.";
      draw();
    }
  });
}

function wireGrowth() {
  const bind = (input, slot, label) => {
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      slot.image = await readFile(file);
      label.textContent = file.name;
    });
  };
  bind($("older-input"), older, $("older-name"));
  bind($("newer-input"), newer, $("newer-name"));
  $("compare").addEventListener("click", async () => {
    const status = $("growth-status");
    const resultBox = $("growth-result");
    const view = $("growth-view");
    if (!older.image || !newer.image) {
      status.textContent = "Add both an older photo and a newer photo.";
      return;
    }
    status.textContent = "Loading OpenCV and matching the two photos. The first run downloads about 10 MB.";
    resultBox.hidden = true;
    view.hidden = true;
    try {
      const result = await compareGrowth(older.image, newer.image, state.sensitivity);
      if (!result.ok) {
        status.textContent = result.message;
        return;
      }
      const olderMeasure = measureCrack(result.warpedOlder, result.width, result.height);
      const newerMeasure = measureCrack(result.newerMask, result.width, result.height);
      const delta = newerMeasure.lengthPx - olderMeasure.lengthPx;
      status.textContent = `Aligned with ${result.inliers} matched points.`;
      resultBox.hidden = false;
      resultBox.replaceChildren();
      const paragraph = document.createElement("p");
      if (result.grew) {
        paragraph.textContent = `The newer photo shows extra crack, about ${Math.round(delta)} px of centreline in the aligned frame, outside a one-pixel margin. That can be real growth. It can also be a change in light or focus. Photograph it the same way next time, with a coin, before treating the difference as movement.`;
      } else if (result.shrank) {
        paragraph.textContent = "The newer outline is shorter. That is often a lighting or focus change, not a crack healing. Compare the outlines rather than the number alone.";
      } else {
        paragraph.textContent = "No clear growth beyond alignment error. A small shift in where you stood can look like change, which is why the comparison ignores a one-pixel margin.";
      }
      resultBox.appendChild(paragraph);
      paintGrowth(view, result);
      view.hidden = false;
    } catch (error) {
      status.textContent = error.message || "The photos could not be compared.";
    }
  });
}

function paintGrowth(view, result) {
  view.width = result.newerCanvas.width;
  view.height = result.newerCanvas.height;
  const context = view.getContext("2d");
  context.drawImage(result.newerCanvas, 0, 0);
  const image = context.getImageData(0, 0, view.width, view.height);
  for (let i = 0; i < result.newerMask.length; i++) {
    const pixel = i * 4;
    if (result.growthMask[i]) {
      image.data[pixel] = 176;
      image.data[pixel + 1] = 42;
      image.data[pixel + 2] = 32;
    } else if (result.newerMask[i] && result.warpedOlder[i]) {
      image.data[pixel] = 40;
      image.data[pixel + 1] = 90;
      image.data[pixel + 2] = 160;
    }
  }
  context.putImageData(image, 0, 0);
}

function wireDrop() {
  const drop = $("drop");
  drop.addEventListener("dragover", (event) => {
    event.preventDefault();
  });
  drop.addEventListener("drop", (event) => {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) onFile(file);
  });
}

let sensitivityTimer = 0;
$("sensitivity").addEventListener("input", () => {
  state.sensitivity = Number($("sensitivity").value) / 100;
  $("sensitivity-value").textContent = $("sensitivity").value;
  clearTimeout(sensitivityTimer);
  sensitivityTimer = setTimeout(() => analyse(), 180);
});
$("invert").addEventListener("change", () => {
  state.invert = $("invert").checked;
  analyse();
});
$("overlay-toggle").addEventListener("change", () => {
  state.showMask = $("overlay-toggle").checked;
  draw();
});
$("camera-input").addEventListener("change", () => onFile($("camera-input").files?.[0]));
$("file-input").addEventListener("change", () => onFile($("file-input").files?.[0]));
$("save").addEventListener("click", () => {
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/jpeg", 0.92);
  link.download = "crackwatch.jpg";
  link.click();
});

renderRules();
renderSamples();
wireScale();
wireGrowth();
wireDrop();

function openSample(sample) {
  const image = new Image();
  // Samples may be served from another host (a CDN redirect). Ask for CORS
  // so the pixel read for segmentation is allowed.
  image.crossOrigin = "anonymous";
  image.onload = () => {
    loadImage(image, `${sample.credit}, ${sample.license}. ${sample.source}`, sample.demoScale || null);
  };
  image.onerror = () => {
    setStatus("This sample photo did not load. Check your connection and try again.");
  };
  image.alt = sample.title;
  image.src = sample.src;
}

document.querySelector(".sample")?.classList.add("selected");
openSample(SAMPLES[0]);
