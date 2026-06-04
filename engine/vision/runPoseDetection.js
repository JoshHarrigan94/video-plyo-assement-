let cachedPoseLandmarker = null;

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
    const frames = await sampleVideoFrames(analysis.video.objectUrl, analysis.video.durationSec);

    const landmarksByFrame = [];

    for (const frame of frames) {
      const result = poseLandmarker.detectForVideo(frame.canvas, Math.round(frame.timeSec * 1000));
      const landmarks = result.landmarks?.[0] || [];

      landmarksByFrame.push({
        frameIndex: frame.frameIndex,
        timeSec: frame.timeSec,
        timestampMs: Math.round(frame.timeSec * 1000),
        landmarks: landmarks.map((point, index) => ({
          index,
          x: point.x,
          y: point.y,
          z: point.z,
          visibility: point.visibility ?? point.presence ?? null
        }))
      });
    }

    analysis.pose = {
      ...analysis.pose,
      detector: "mediapipe_pose_landmarker_lite",
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
      message: error.message
    });

    return analysis;
  }
}

async function getPoseLandmarker() {
  if (cachedPoseLandmarker) return cachedPoseLandmarker;

  const { FilesetResolver, PoseLandmarker } = window.MediaPipeVision;

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm"
  );

  try {
  cachedPoseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    numPoses: 1
  });
} catch (gpuError) {
  console.warn("GPU pose model failed. Falling back to CPU.", gpuError);

  cachedPoseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
      delegate: "CPU"
    },
    runningMode: "VIDEO",
    numPoses: 1
  });
}

  return cachedPoseLandmarker;
}

async function sampleVideoFrames(objectUrl, durationSec) {
  const video = document.createElement("video");
  video.src = objectUrl;
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";

  await waitForMetadata(video);

  const duration = Number.isFinite(durationSec) ? durationSec : video.duration;
  const sampleFps = 10;
  const maxFrames = 120;
  const frameCount = Math.min(Math.ceil(duration * sampleFps), maxFrames);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const frames = [];

  for (let i = 0; i < frameCount; i++) {
    const timeSec = Math.min(i / sampleFps, Math.max(0, duration - 0.05));

    await seekVideo(video, timeSec);

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const frameCanvas = document.createElement("canvas");
    frameCanvas.width = canvas.width;
    frameCanvas.height = canvas.height;
    frameCanvas.getContext("2d").drawImage(canvas, 0, 0);

    frames.push({
      frameIndex: i,
      timeSec,
      canvas: frameCanvas
    });
  }

  return frames;
}

function waitForMetadata(video) {
  return new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = () => reject(new Error("Could not load video metadata for pose detection."));
  });
}

function seekVideo(video, timeSec) {
  return new Promise((resolve, reject) => {
    video.onseeked = resolve;
    video.onerror = () => reject(new Error("Video seek failed during pose detection."));
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
    average: round(values.reduce((sum, value) => sum + value, 0) / values.length, 3),
    minimum: round(Math.min(...values), 3),
    byLandmark: {}
  };
}

function round(value, decimals = 3) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
