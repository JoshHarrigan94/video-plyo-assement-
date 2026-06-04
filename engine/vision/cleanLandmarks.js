export async function cleanLandmarks(analysis) {
  analysis.pose.status =
    analysis.pose.status === "not_run"
      ? "not_run"
      : analysis.pose.status;

  const landmarksByFrame = analysis.pose.landmarksByFrame || [];

  if (!landmarksByFrame.length) {
    analysis.pose.flags.push("landmark_cleaning_skipped_no_landmarks");

    analysis.logs.push({
      time: new Date().toISOString(),
      level: "warn",
      module: "vision",
      message: "Landmark cleaning skipped because no landmarks are available."
    });

    return analysis;
  }

  const cleanedFrames = landmarksByFrame.map((frame) => {
    return {
      ...frame,
      landmarks: cleanFrameLandmarks(frame.landmarks || [])
    };
  });

  analysis.pose.landmarksByFrame = cleanedFrames;
  analysis.pose.visibility = calculateVisibility(cleanedFrames);

  analysis.logs.push({
    time: new Date().toISOString(),
    level: "info",
    module: "vision",
    message: "Landmarks cleaned."
  });

  return analysis;
}

function cleanFrameLandmarks(landmarks) {
  return landmarks.map((landmark) => {
    return {
      ...landmark,

      x: cleanNumber(landmark.x),
      y: cleanNumber(landmark.y),
      z: cleanNumber(landmark.z),

      visibility: cleanConfidence(
        landmark.visibility ?? landmark.presence ?? null
      )
    };
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

  const average =
    values.reduce((sum, value) => sum + value, 0) / values.length;

  const minimum = Math.min(...values);

  return {
    average: round(average, 3),
    minimum: round(minimum, 3),
    byLandmark: {}
  };
}

function cleanNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanConfidence(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) return null;

  return clamp(number, 0, 1);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, decimals = 3) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
