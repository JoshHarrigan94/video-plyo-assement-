let cachedPoseLandmarker = null;
let cachedDelegate = null;

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm";

export async function runPoseDetection(analysis) {
  analysis.pose.status = "running";

  const canRunPose =
    Boolean(analysis.video.objectUrl) &&
    analysis.quality.status !== "failed";

  if (!canRunPose) {
    analysis.pose.status = "skipped";
    analysis.pose.flags.push("pose_detection_skipped_due_to_quality_gate");
    return analysis;
  }

  if (!window.MediaPipeVision) {
    analysis.pose.status = "skipped";
    analysis.pose.flags.push("mediapipe_library_not_loaded");
    return analysis;
  }

  try {
    const poseLandmarker = await getPoseLandmarker();

    const landmarksByFrame = await processVideoFramesSequentially({
      objectUrl: analysis.video.objectUrl,
      durationSec: analysis.video.durationSec,
      poseLandmarker
    });

    analysis.pose = {
      ...analysis.pose,
      detector: `mediapipe_pose_landmarker_lite_${cachedDelegate || "unknown"}`,
      status: "complete",
      framesProcessed: landmarksByFrame.length,
      landmarksByFrame,
      visibility: calculateVisibility(landmarksByFrame),
      flags: landmarksByFrame.some(frame => frame.landmarks.length)
        ? []
        : ["no_pose_detected"]
    };

    analysis.logs.push({
      time: new Date().toISOString(),
      level: "info",
      module: "vision",
      message: `MediaPipe pose detection completed on ${landmarksByFrame.length} frame(s).`
    });

    return analysis;
  } catch (error) {
    analysis.pose.status = "error";
    analysis.pose.flags.push("pose_detection_failed");

    analysis.errors.push({
      time: new Date().toISOString(),
      module: "vision",
      message: error.message || "Pose detection failed."
    });

    analysis.logs.push({
      time: new Date().toISOString(),
      level: "error",
      module: "vision",
      message: `Pose detection failed: ${error.message || "Unknown error"}`
    });

    return analysis;
  }
}

async function getPoseLandmarker() {
  if (cachedPoseLandmarker) return cachedPoseLandmarker;

  const { FilesetResolver, PoseLandmarker } = window.MediaPipeVision;

  const vision = await FilesetResolver.forVisionTasks(WASM_URL);

  try {
    cachedPoseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numPoses: 1
    });

    cachedDelegate = "gpu";
    return cachedPoseLandmarker;
  } catch (gpuError) {
    console.warn("GPU pose model failed. Falling back to CPU.", gpuError);
  }

  cachedPoseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate: "CPU"
    },
    runningMode: "VIDEO",
    numPoses: 1
  });

  cachedDelegate = "cpu";
  return cachedPoseLandmarker;
}

async function processVideoFramesSequentially({
  objectUrl,
  durationSec,
  poseLandmarker
}) {
  const video = document.createElement("video");

  video.src = objectUrl;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  await waitForMetadata(video);

  const duration = Number.isFinite(durationSec)
    ? durationSec
    : video.duration;

  const settings = getProcessingSettings({
    durationSec: duration,
    sourceWidth: video.videoWidth,
    sourceHeight: video.videoHeight
  });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", {
    willReadFrequently: true
  });

  canvas.width = settings.width;
  canvas.height = settings.height;

  const landmarksByFrame = [];

  for (let frameIndex = 0; frameIndex < settings.frameCount; frameIndex++) {
    const timeSec = Math.min(
      frameIndex / settings.sampleFps,
      Math.max(0, duration - 0.05)
    );

    await seekVideo(video, timeSec);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const timestampMs = Math.round(timeSec * 1000);
    const result = poseLandmarker.detectForVideo(canvas, timestampMs);
    const landmarks = result.landmarks?.[0] || [];

    landmarksByFrame.push({
      frameIndex,
      timeSec: round(timeSec, 4),
      timestampMs,
      sourceWidth: video.videoWidth,
      sourceHeight: video.videoHeight,
      processingWidth: canvas.width,
      processingHeight: canvas.height,
      landmarks: landmarks.map((point, index) => ({
        index,
        x: point.x,
        y: point.y,
        z: point.z,
        visibility: point.visibility ?? point.presence ?? null
      }))
    });

    if (frameIndex % 8 === 0) {
      await yieldToBrowser();
    }
  }

  video.remove();
  canvas.width = 1;
  canvas.height = 1;

  return landmarksByFrame;
}

function getProcessingSettings({
  durationSec,
  sourceWidth,
  sourceHeight
}) {
  const duration = Number.isFinite(durationSec)
    ? durationSec
    : 0;

  const isLongVideo = duration > 8;
  const sampleFps = isLongVideo ? 4 : 6;

  const maxFrames = isLongVideo ? 48 : 72;

  const frameCount = Math.min(
    Math.max(1, Math.ceil(duration * sampleFps)),
    maxFrames
  );

  const maxProcessingSide = 720;

  const sourceMaxSide = Math.max(sourceWidth || 0, sourceHeight || 0);

  const scale =
    sourceMaxSide > maxProcessingSide
      ? maxProcessingSide / sourceMaxSide
      : 1;

  const width = Math.max(1, Math.round((sourceWidth || 640) * scale));
  const height = Math.max(1, Math.round((sourceHeight || 360) * scale));

  return {
    sampleFps,
    maxFrames,
    frameCount,
    width,
    height
  };
}

function waitForMetadata(video) {
  return new Promise((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => {
      reject(
        new Error(
          "Could not load video metadata for pose detection."
        )
      );
    };
  });
}

function seekVideo(video, timeSec) {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `Video seek timed out at ${timeSec.toFixed(3)}s.`
        )
      );
    }, 5000);

    function cleanup() {
      window.clearTimeout(timeout);
      video.onseeked = null;
      video.onerror = null;
    }

    video.onseeked = () => {
      cleanup();
      resolve();
    };

    video.onerror = () => {
      cleanup();
      reject(
        new Error(
          "Video seek failed during pose detection."
        )
      );
    };

    video.currentTime = timeSec;
  });
}

function calculateVisibility(frames) {
  const values = [];

  for (const frame of frames) {
    for (const landmark of frame.landmarks || []) {
      if (Number.isFinite(landmark.visibility)) {
        values.push(landmark.visibility);
      }
    }
  }

  if (!values.length) {
    return {
      average: null,
      minimum: null,
      byLandmark: {}
    };
  }

  return {
    average: round(
      values.reduce((sum, value) => sum + value, 0) / values.length,
      3
    ),
    minimum: round(Math.min(...values), 3),
    byLandmark: {}
  };
}

function yieldToBrowser() {
  return new Promise(resolve => {
    window.setTimeout(resolve, 0);
  });
}

function round(value, decimals = 3) {
  const number = Number(value);

  if (!Number.isFinite(number)) return null;

  const factor = Math.pow(10, decimals);
  return Math.round(number * factor) / factor;
}