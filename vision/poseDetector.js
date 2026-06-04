export async function runPoseDetection(analysis) {
  analysis.pose = {
    status: "placeholder",
    provider: "mediapipe-ready-interface",
    frames: [],
    landmarks: [],
    visibility: {},
    note: "Wire MediaPipe Pose Landmarker here. Keep this module as the only direct MediaPipe dependency."
  };
  analysis.flags.push("pose:not-yet-integrated");
  return analysis;
}
