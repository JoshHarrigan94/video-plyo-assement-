import { runPlyoAnalysis } from "../engine/index.js";
const metricSummary = document.getElementById("metricSummary");
const form = document.getElementById("analysisForm");
const videoFileInput = document.getElementById("videoFile");
const videoPreview = document.getElementById("videoPreview");
const output = document.getElementById("output");
const downloadJsonBtn = document.getElementById("downloadJsonBtn");
const drawPoseBtn = document.getElementById("drawPoseBtn");
const clearPoseBtn = document.getElementById("clearPoseBtn");
const poseCanvas = document.getElementById("poseCanvas");
const signalSummary = document.getElementById("signalSummary");
const eventTimeline = document.getElementById("eventTimeline");

let latestAnalysis = null;
let latestVideoUrl = null;

const POSE_CONNECTIONS = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
  [27, 29],
  [29, 31],
  [28, 30],
  [30, 32],
  [27, 31],
  [28, 32]
];

videoFileInput.addEventListener("change", () => {
  const file = videoFileInput.files?.[0];

  if (!file) return;

  if (latestVideoUrl) {
    URL.revokeObjectURL(latestVideoUrl);
  }

  latestVideoUrl = URL.createObjectURL(file);
  videoPreview.src = latestVideoUrl;

  clearPoseOverlay();

  latestAnalysis = null;
  downloadJsonBtn.disabled = true;
  drawPoseBtn.disabled = true;
  clearPoseBtn.disabled = true;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const videoFile = videoFileInput.files?.[0];

  if (!videoFile) {
    output.textContent = "Please upload a video first.";
    return;
  }

  output.textContent = "Running analysis scaffold...";
renderSignalSummary(latestAnalysis);
renderMetricSummary(latestAnalysis);
renderEventTimeline(latestAnalysis);
  downloadJsonBtn.disabled = true;
  drawPoseBtn.disabled = true;
  clearPoseBtn.disabled = true;
  clearPoseOverlay();

  try {
    const input = {
      videoFile,
      heightCm: document.getElementById("heightCm").value,
      weightKg: document.getElementById("weightKg").value,
      sexGender: document.getElementById("sexGender").value,
      useSmartCrop: true,
      useAudio: true,
      useMLRefinement: false
    };

    latestAnalysis = await runPlyoAnalysis(input);

    output.textContent = JSON.stringify(latestAnalysis, null, 2);

    downloadJsonBtn.disabled = false;

    const hasLandmarks =
      latestAnalysis.pose?.landmarksByFrame?.some(
        frame => frame.landmarks?.length
      );

    drawPoseBtn.disabled = !hasLandmarks;
    clearPoseBtn.disabled = !hasLandmarks;
  } catch (error) {
    console.error(error);

    output.textContent = JSON.stringify(
      {
        status: "failed",
        message: error.message
      },
      null,
      2
    );
  }
});

drawPoseBtn.addEventListener("click", () => {
  drawPoseOverlay();
});

clearPoseBtn.addEventListener("click", () => {
  clearPoseOverlay();
});

downloadJsonBtn.addEventListener("click", () => {
  if (!latestAnalysis) return;

  const blob = new Blob(
    [JSON.stringify(latestAnalysis, null, 2)],
    {
      type: "application/json"
    }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `${latestAnalysis.id || "plyo-analysis"}.json`;
  link.click();

  URL.revokeObjectURL(url);
});

function drawPoseOverlay() {
  if (!latestAnalysis) return;

  const frame = getClosestPoseFrame();

  if (!frame?.landmarks?.length) {
    output.textContent += "\n\nNo landmarks available for current video time.";
    return;
  }

  resizePoseCanvas();

  const ctx = poseCanvas.getContext("2d");
  const landmarks = frame.landmarks;

  ctx.clearRect(0, 0, poseCanvas.width, poseCanvas.height);

  drawConnections(ctx, landmarks);
  drawLandmarks(ctx, landmarks);
}

function getClosestPoseFrame() {
  const frames = latestAnalysis?.pose?.landmarksByFrame || [];

  if (!frames.length) return null;

  const currentTime = videoPreview.currentTime || 0;

  let closest = frames[0];
  let smallestDelta = Math.abs((closest.timeSec || 0) - currentTime);

  for (const frame of frames) {
    const delta = Math.abs((frame.timeSec || 0) - currentTime);

    if (delta < smallestDelta) {
      closest = frame;
      smallestDelta = delta;
    }
  }

  return closest;
}

function drawConnections(ctx, landmarks) {
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(56, 189, 248, 0.9)";

  for (const [a, b] of POSE_CONNECTIONS) {
    const pointA = landmarks[a];
    const pointB = landmarks[b];

    if (!isUsable(pointA) || !isUsable(pointB)) continue;

    ctx.beginPath();
    ctx.moveTo(pointA.x * poseCanvas.width, pointA.y * poseCanvas.height);
    ctx.lineTo(pointB.x * poseCanvas.width, pointB.y * poseCanvas.height);
    ctx.stroke();
  }
}

function drawLandmarks(ctx, landmarks) {
  for (const landmark of landmarks) {
    if (!isUsable(landmark)) continue;

    const x = landmark.x * poseCanvas.width;
    const y = landmark.y * poseCanvas.height;

    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(34, 197, 94, 0.95)";
    ctx.fill();

    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
    ctx.stroke();
  }
}

function isUsable(point) {
  if (!point) return false;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;

  if (
    Number.isFinite(point.visibility) &&
    point.visibility < 0.35
  ) {
    return false;
  }

  return true;
}

function clearPoseOverlay() {
  resizePoseCanvas();

  const ctx = poseCanvas.getContext("2d");
  ctx.clearRect(0, 0, poseCanvas.width, poseCanvas.height);
}

function resizePoseCanvas() {
  const rect = videoPreview.getBoundingClientRect();

  poseCanvas.width = Math.max(1, Math.round(rect.width));
  poseCanvas.height = Math.max(1, Math.round(rect.height));
}

window.addEventListener("resize", () => {
  if (!latestAnalysis) return;
  drawPoseOverlay();
});

function renderSignalSummary(analysis) {
  if (!signalSummary) return;

  const framesProcessed = analysis.pose?.framesProcessed ?? 0;
  const poseVisibility = analysis.pose?.visibility?.average;
  const signalQuality = analysis.signals?.quality?.score;

  const angles = analysis.signals?.angles || {};

  const kneeRange = combinedRange([
    angles.leftKneeAngle,
    angles.rightKneeAngle
  ]);

  const hipRange = combinedRange([
    angles.leftHipAngle,
    angles.rightHipAngle
  ]);

  const ankleRange = combinedRange([
    angles.leftAnkleAngle,
    angles.rightAnkleAngle
  ]);

  signalSummary.innerHTML = `
    <div class="summary-item">
      <span>Frames</span>
      <strong>${framesProcessed}</strong>
    </div>

    <div class="summary-item">
      <span>Pose Visibility</span>
      <strong>${formatPercent(poseVisibility)}</strong>
    </div>

    <div class="summary-item">
      <span>Signal Quality</span>
      <strong>${formatPercentFrom100(signalQuality)}</strong>
    </div>

    <div class="summary-item">
      <span>Knee Angle Range</span>
      <strong>${formatRange(kneeRange)}</strong>
    </div>

    <div class="summary-item">
      <span>Hip Angle Range</span>
      <strong>${formatRange(hipRange)}</strong>
    </div>

    <div class="summary-item">
      <span>Ankle Angle Range</span>
      <strong>${formatRange(ankleRange)}</strong>
    </div>
  `;
}

function combinedRange(streams) {
  const values = streams
    .flat()
    .filter(Number.isFinite);

  if (!values.length) return null;

  return {
    min: Math.min(...values),
    max: Math.max(...values)
  };
}

function formatRange(range) {
  if (!range) return "--";

  return `${Math.round(range.min)}°–${Math.round(range.max)}°`;
}

function formatPercent(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) return "--";

  return `${Math.round(number * 100)}%`;
}

function formatPercentFrom100(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) return "--";

  return `${Math.round(number)}%`;
}

function renderEventTimeline(analysis) {
  if (!eventTimeline) return;

  const takeOffs = analysis.events?.takeOffs || [];
  const landings = analysis.events?.landings || [];
  const contactWindows = analysis.metrics?.windows?.contact || [];
  const flightWindows = analysis.metrics?.windows?.flight || [];
  const audioImpacts = analysis.audio?.impacts || [];
  const rows = [];

  for (const event of takeOffs) {
    rows.push({
      type: "takeoff",
      time: event.timeSec,
      label: "Take-off",
      detail: `Frame ${event.frameIndex} · ${formatTime(event.timeSec)} · ${formatFlags(event.flags)}`,
      confidence: event.confidence
    });
  }

  for (const event of landings) {
    rows.push({
      type: "landing",
      time: event.timeSec,
      label: "Landing",
      detail: `Frame ${event.frameIndex} · ${formatTime(event.timeSec)} · ${formatFlags(event.flags)}`,
      confidence: event.confidence
    });
  }

  for (const window of flightWindows) {
    rows.push({
      type: "flight",
      time: window.startTimeSec,
      label: "Flight",
      detail: `${formatTime(window.startTimeSec)} → ${formatTime(window.endTimeSec)} · ${window.durationSec}s`,
      confidence: window.confidence
    });
  }

  for (const window of contactWindows) {
    rows.push({
      type: "contact",
      time: window.startTimeSec,
      label: "Contact",
      detail: `${formatTime(window.startTimeSec)} → ${formatTime(window.endTimeSec)} · ${window.durationSec}s`,
      confidence: window.confidence
    });
  }

  rows.sort((a, b) => {
    const aTime = Number.isFinite(a.time) ? a.time : Infinity;
    const bTime = Number.isFinite(b.time) ? b.time : Infinity;
    return aTime - bTime;
  });
  
  for (const impact of audioImpacts) {
  rows.push({
    type: "audio",
    time: impact.timeSec,
    label: "Audio",
    detail: `${formatTime(impact.timeSec)} · RMS ${impact.rms} · peak ${impact.peak} · ${formatFlags(impact.flags)}`,
    confidence: impact.confidence
  });
}

  if (!rows.length) {
    eventTimeline.innerHTML = `
      <p class="hint">
        No event candidates detected yet. Try a clearer full-body video with visible feet and one obvious jump.
      </p>
    `;
    return;
  }

  eventTimeline.innerHTML = rows.map(row => `
    <div class="event-row">
      <div class="event-type ${row.type}">${row.label}</div>
      <div class="event-detail">${row.detail}</div>
      <div class="event-confidence">${formatConfidence(row.confidence)}</div>
    </div>
  `).join("");
}

function formatTime(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) return "--";

  return `${number.toFixed(3)}s`;
}

function formatConfidence(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) return "--";

  return `${Math.round(number * 100)}%`;
}

function formatFlags(flags = []) {
  if (!flags.length) return "no flags";

  return flags.slice(0, 2).join(", ");
}
