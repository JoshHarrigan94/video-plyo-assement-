export async function extractJointSignals(analysis) {
  const frames = analysis.pose.landmarksByFrame || [];

  if (!frames.length) {
    analysis.signals.status = "skipped";

    analysis.signals.quality.flags.push(
      "signal_extraction_skipped_no_landmarks"
    );

    analysis.logs.push({
      time: new Date().toISOString(),
      level: "warn",
      module: "signals",
      message: "Signal extraction skipped because no landmarks exist."
    });

    return analysis;
  }

  analysis.signals.status = "running";

  const signals = {
    hipY: [],
    ankleY: [],
    kneeAngle: [],
    hipVelocity: [],
    ankleVelocity: []
  };

  /*
    Future MediaPipe landmarks:

    LEFT_HIP = 23
    RIGHT_HIP = 24

    LEFT_KNEE = 25
    RIGHT_KNEE = 26

    LEFT_ANKLE = 27
    RIGHT_ANKLE = 28
  */

  for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
    const frame = frames[frameIndex];

    const landmarks = frame.landmarks || [];

    const leftHip = landmarks[23];
    const rightHip = landmarks[24];

    const leftKnee = landmarks[25];
    const rightKnee = landmarks[26];

    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];

    const hipY = averageCoordinate(leftHip?.y, rightHip?.y);
    const ankleY = averageCoordinate(leftAnkle?.y, rightAnkle?.y);

    const kneeAngle = estimateKneeAngle(
      leftHip,
      leftKnee,
      leftAnkle,
      rightHip,
      rightKnee,
      rightAnkle
    );

    signals.hipY.push(hipY);
    signals.ankleY.push(ankleY);
    signals.kneeAngle.push(kneeAngle);
  }

  signals.hipVelocity =
    calculateVelocity(signals.hipY);

  signals.ankleVelocity =
    calculateVelocity(signals.ankleY);

  analysis.signals = {
    ...analysis.signals,

    status: "complete",

    landmarks: {
      framesProcessed: frames.length
    },

    joints: {
      hipY: signals.hipY,
      ankleY: signals.ankleY,
      kneeAngle: signals.kneeAngle
    },

    velocities: {
      hipVelocity: signals.hipVelocity,
      ankleVelocity: signals.ankleVelocity
    },

    quality: {
      score: estimateSignalQuality(signals),
      flags: []
    }
  };

  analysis.logs.push({
    time: new Date().toISOString(),
    level: "info",
    module: "signals",
    message: "Joint signals extracted."
  });

  return analysis;
}

function averageCoordinate(a, b) {
  const values = [a, b].filter(Number.isFinite);

  if (!values.length) return null;

  return values.reduce((x, y) => x + y, 0) / values.length;
}

function calculateVelocity(signal) {
  const velocity = [null];

  for (let i = 1; i < signal.length; i++) {
    const previous = signal[i - 1];
    const current = signal[i];

    if (
      !Number.isFinite(previous) ||
      !Number.isFinite(current)
    ) {
      velocity.push(null);
      continue;
    }

    velocity.push(current - previous);
  }

  return velocity;
}

function estimateKneeAngle() {
  /*
    Placeholder.

    Future:
    vector maths
    hip-knee-ankle angle
  */

  return null;
}

function estimateSignalQuality(signals) {
  const total =
    signals.hipY.length +
    signals.ankleY.length +
    signals.kneeAngle.length;

  if (!total) return 0;

  return 50;
}
