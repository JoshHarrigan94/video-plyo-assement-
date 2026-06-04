export async function runPoseDetection(analysis) {
  analysis.pose.status = "running";

  /*
    v0.1 MediaPipe-ready placeholder.

    This file is intentionally structured as an adapter.

    Later, this is where we plug in:
    - MediaPipe Pose Landmarker
    - model loading
    - frame-by-frame detection
    - landmark extraction
    - landmark visibility scoring

    The rest of the engine should not care whether landmarks
    came from MediaPipe, another model, or test data.
  */

  const canRunPose =
    Boolean(analysis.video.objectUrl) &&
    analysis.quality.status !== "failed";

  if (!canRunPose) {
    analysis.pose.status = "skipped";
    analysis.pose.flags.push("pose_detection_skipped_due_to_failed_quality_gate");

    analysis.logs.push({
      time: new Date().toISOString(),
      level: "warn",
      module: "vision",
      message: "Pose detection skipped because video quality gate failed."
    });

    return analysis;
  }

  analysis.pose = {
    ...analysis.pose,

    detector: "mediapipe_pose_landmarker_pending",

    status: "complete",

    framesProcessed: 0,

    landmarksByFrame: [],

    visibility: {
      average: null,
      minimum: null,
      byLandmark: {}
    },

    flags: [
      "mediapipe_not_yet_connected",
      "no_landmarks_extracted"
    ]
  };

  analysis.logs.push({
    time: new Date().toISOString(),
    level: "info",
    module: "vision",
    message: "Pose detection placeholder executed."
  });

  return analysis;
}
