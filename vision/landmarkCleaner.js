export async function cleanLandmarks(analysis) {
  analysis.pose.cleaned = {
    status: "placeholder",
    smoothing: "none",
    interpolation: "none",
    note: "Next pass: smooth jitter, handle missing landmarks, preserve raw vs cleaned coordinates."
  };
  return analysis;
}
