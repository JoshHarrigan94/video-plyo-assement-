export async function extractJointSignals(analysis) {
  analysis.signals = {
    status: "placeholder",
    ankleY: [],
    hipY: [],
    kneeAngles: [],
    ankleVelocity: [],
    hipVelocity: [],
    footContactLikelihood: [],
    note: "Signals are empty until MediaPipe landmarks are wired."
  };
  return analysis;
}
