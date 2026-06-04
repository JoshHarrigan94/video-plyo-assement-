export async function extractJointSignals(analysis) {
  const frames = analysis.pose.landmarksByFrame || [];

  if (!frames.length) {
    analysis.signals.status = "skipped";
    analysis.signals.quality.flags.push("signal_extraction_skipped_no_landmarks");

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
    kneeY: [],

    leftKneeAngle: [],
    rightKneeAngle: [],
    leftHipAngle: [],
    rightHipAngle: [],
    leftAnkleAngle: [],
    rightAnkleAngle: [],

    hipVelocity: [],
    ankleVelocity: [],
    kneeVelocity: []
  };

  for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
    const frame = frames[frameIndex];
    const landmarks = frame.landmarks || [];

    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];

    const leftHip = landmarks[23];
    const rightHip = landmarks[24];

    const leftKnee = landmarks[25];
    const rightKnee = landmarks[26];

    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];

    const leftFoot = landmarks[31];
    const rightFoot = landmarks[32];

    const hipY = averageCoordinate(leftHip?.y, rightHip?.y);
    const kneeY = averageCoordinate(leftKnee?.y, rightKnee?.y);
    const ankleY = averageCoordinate(leftAnkle?.y, rightAnkle?.y);

    signals.hipY.push(hipY);
    signals.kneeY.push(kneeY);
    signals.ankleY.push(ankleY);

    signals.leftKneeAngle.push(angleDegrees(leftHip, leftKnee, leftAnkle));
    signals.rightKneeAngle.push(angleDegrees(rightHip, rightKnee, rightAnkle));

    signals.leftHipAngle.push(angleDegrees(leftShoulder, leftHip, leftKnee));
    signals.rightHipAngle.push(angleDegrees(rightShoulder, rightHip, rightKnee));

    signals.leftAnkleAngle.push(angleDegrees(leftKnee, leftAnkle, leftFoot));
    signals.rightAnkleAngle.push(angleDegrees(rightKnee, rightAnkle, rightFoot));
  }

  signals.hipVelocity = calculateVelocity(signals.hipY);
  signals.kneeVelocity = calculateVelocity(signals.kneeY);
  signals.ankleVelocity = calculateVelocity(signals.ankleY);

  analysis.signals = {
    ...analysis.signals,

    status: "complete",

    landmarks: {
      framesProcessed: frames.length
    },

    joints: {
      hipY: signals.hipY,
      kneeY: signals.kneeY,
      ankleY: signals.ankleY
    },

    angles: {
      leftKneeAngle: signals.leftKneeAngle,
      rightKneeAngle: signals.rightKneeAngle,
      leftHipAngle: signals.leftHipAngle,
      rightHipAngle: signals.rightHipAngle,
      leftAnkleAngle: signals.leftAnkleAngle,
      rightAnkleAngle: signals.rightAnkleAngle
    },

    velocities: {
      hipVelocity: signals.hipVelocity,
      kneeVelocity: signals.kneeVelocity,
      ankleVelocity: signals.ankleVelocity
    },

    quality: {
      score: estimateSignalQuality(signals),
      flags: buildSignalFlags(signals)
    }
  };

  analysis.logs.push({
    time: new Date().toISOString(),
    level: "info",
    module: "signals",
    message: "Joint signals and angles extracted."
  });

  return analysis;
}

function angleDegrees(a, b, c) {
  if (!isPoint(a) || !isPoint(b) || !isPoint(c)) return null;

  const ab = {
    x: a.x - b.x,
    y: a.y - b.y
  };

  const cb = {
    x: c.x - b.x,
    y: c.y - b.y
  };

  const dot = ab.x * cb.x + ab.y * cb.y;

  const magAB = Math.sqrt(ab.x * ab.x + ab.y * ab.y);
  const magCB = Math.sqrt(cb.x * cb.x + cb.y * cb.y);

  if (!magAB || !magCB) return null;

  const cosine = clamp(dot / (magAB * magCB), -1, 1);
  const radians = Math.acos(cosine);

  return round((radians * 180) / Math.PI, 2);
}

function averageCoordinate(a, b) {
  const values = [a, b].filter(Number.isFinite);

  if (!values.length) return null;

  return round(values.reduce((x, y) => x + y, 0) / values.length, 5);
}

function calculateVelocity(signal) {
  const velocity = [null];

  for (let i = 1; i < signal.length; i++) {
    const previous = signal[i - 1];
    const current = signal[i];

    if (!Number.isFinite(previous) || !Number.isFinite(current)) {
      velocity.push(null);
      continue;
    }

    velocity.push(round(current - previous, 5));
  }

  return velocity;
}

function estimateSignalQuality(signals) {
  const streams = [
    signals.hipY,
    signals.kneeY,
    signals.ankleY,
    signals.leftKneeAngle,
    signals.rightKneeAngle,
    signals.leftHipAngle,
    signals.rightHipAngle,
    signals.leftAnkleAngle,
    signals.rightAnkleAngle
  ];

  const values = streams.flat();
  const valid = values.filter(Number.isFinite);

  if (!values.length) return 0;

  return Math.round((valid.length / values.length) * 100);
}

function buildSignalFlags(signals) {
  const flags = [];

  const quality = estimateSignalQuality(signals);

  if (quality < 50) flags.push("low_signal_completeness");
  if (quality < 80) flags.push("some_joint_signals_missing");

  if (!signals.leftKneeAngle.some(Number.isFinite)) {
    flags.push("left_knee_angle_missing");
  }

  if (!signals.rightKneeAngle.some(Number.isFinite)) {
    flags.push("right_knee_angle_missing");
  }

  return flags;
}

function isPoint(point) {
  return (
    point &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y)
  );
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, decimals = 3) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
