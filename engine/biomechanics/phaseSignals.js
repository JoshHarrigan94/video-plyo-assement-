export function buildPhaseSignals({
  joints = {},
  velocities = {},
  angles = {},
  sourceFrames = [],
  fps = 30
}) {
  const hipY = joints.hipY || [];
  const kneeY = joints.kneeY || [];
  const ankleY = joints.ankleY || [];

  const hipVelocity = velocities.hipVelocity || [];
  const kneeVelocity = velocities.kneeVelocity || [];
  const ankleVelocity = velocities.ankleVelocity || [];

  const leftHipAngle = angles.leftHipAngle || [];
  const rightHipAngle = angles.rightHipAngle || [];
  const leftKneeAngle = angles.leftKneeAngle || [];
  const rightKneeAngle = angles.rightKneeAngle || [];
  const leftAnkleAngle = angles.leftAnkleAngle || [];
  const rightAnkleAngle = angles.rightAnkleAngle || [];

  const length = Math.max(
    hipY.length,
    kneeY.length,
    ankleY.length,
    hipVelocity.length,
    kneeVelocity.length,
    ankleVelocity.length,
    leftHipAngle.length,
    rightHipAngle.length,
    leftKneeAngle.length,
    rightKneeAngle.length,
    leftAnkleAngle.length,
    rightAnkleAngle.length
  );

  const frames = [];

  for (let i = 0; i < length; i++) {
    const hipAngle = average([
      leftHipAngle[i],
      rightHipAngle[i]
    ]);

    const kneeAngle = average([
      leftKneeAngle[i],
      rightKneeAngle[i]
    ]);

    const ankleAngle = average([
      leftAnkleAngle[i],
      rightAnkleAngle[i]
    ]);

    const comY = estimateSimpleComY({
      hipY: hipY[i],
      kneeY: kneeY[i],
      ankleY: ankleY[i]
    });

    const previousHipAngle = average([
      leftHipAngle[i - 1],
      rightHipAngle[i - 1]
    ]);

    const previousKneeAngle = average([
      leftKneeAngle[i - 1],
      rightKneeAngle[i - 1]
    ]);

    const previousAnkleAngle = average([
      leftAnkleAngle[i - 1],
      rightAnkleAngle[i - 1]
    ]);

    const hipExtensionVelocity = angleDelta(
      hipAngle,
      previousHipAngle,
      fps
    );

    const kneeExtensionVelocity = angleDelta(
      kneeAngle,
      previousKneeAngle,
      fps
    );

    const ankleExtensionVelocity = angleDelta(
      ankleAngle,
      previousAnkleAngle,
      fps
    );

    const upwardComVelocity =
      Number.isFinite(hipVelocity[i])
        ? -hipVelocity[i]
        : null;

    const tripleExtensionScore = scoreTripleExtension({
      hipExtensionVelocity,
      kneeExtensionVelocity,
      ankleExtensionVelocity,
      upwardComVelocity
    });

    const unloadingScore = scoreUnloading({
      ankleVelocity: ankleVelocity[i],
      upwardComVelocity,
      tripleExtensionScore
    });

    frames.push({
      frameIndex: i,
      timeSec:
  sourceFrames[i]?.timeSec ??
  frameToTime(i, fps),

      comY,
      hipY: clean(hipY[i]),
      kneeY: clean(kneeY[i]),
      ankleY: clean(ankleY[i]),

      hipVelocity: clean(hipVelocity[i]),
      kneeVelocity: clean(kneeVelocity[i]),
      ankleVelocity: clean(ankleVelocity[i]),

      upwardComVelocity,

      hipAngle,
      kneeAngle,
      ankleAngle,

      hipExtensionVelocity,
      kneeExtensionVelocity,
      ankleExtensionVelocity,

      tripleExtensionScore,
      unloadingScore
    });
  }

  return {
    fps,
    frames,
    summary: summarisePhaseSignals(frames),
    flags: buildFlags(frames)
  };
}

function estimateSimpleComY({ hipY, kneeY, ankleY }) {
  /*
    First-pass visual COM proxy.

    This is not true whole-body COM yet.

    It weights hip more heavily because:
    - hips are a better proxy for body mass centre than feet
    - knee/ankle help stabilise the estimate when hip landmarks jitter
  */

  const weighted = [];

  if (Number.isFinite(hipY)) {
    weighted.push({ value: hipY, weight: 0.7 });
  }

  if (Number.isFinite(kneeY)) {
    weighted.push({ value: kneeY, weight: 0.2 });
  }

  if (Number.isFinite(ankleY)) {
    weighted.push({ value: ankleY, weight: 0.1 });
  }

  if (!weighted.length) return null;

  const totalWeight = weighted.reduce(
    (sum, item) => sum + item.weight,
    0
  );

  const value =
    weighted.reduce(
      (sum, item) => sum + item.value * item.weight,
      0
    ) / totalWeight;

  return round(value, 5);
}

function scoreTripleExtension({
  hipExtensionVelocity,
  kneeExtensionVelocity,
  ankleExtensionVelocity,
  upwardComVelocity
}) {
  /*
    Triple extension should show:
    - hip angle opening
    - knee angle opening
    - ankle contribution
    - centre of mass moving upward

    Score is 0–1.
  */

  const hipScore = positiveScore(hipExtensionVelocity, 40);
  const kneeScore = positiveScore(kneeExtensionVelocity, 50);
  const ankleScore = positiveScore(ankleExtensionVelocity, 35);
  const upwardScore = positiveScore(upwardComVelocity, 0.015);

  const values = [
    { value: hipScore, weight: 0.25 },
    { value: kneeScore, weight: 0.35 },
    { value: ankleScore, weight: 0.15 },
    { value: upwardScore, weight: 0.25 }
  ].filter(item => Number.isFinite(item.value));

  if (!values.length) return null;

  const totalWeight = values.reduce(
    (sum, item) => sum + item.weight,
    0
  );

  const score =
    values.reduce(
      (sum, item) => sum + item.value * item.weight,
      0
    ) / totalWeight;

  return round(clamp(score, 0, 1), 3);
}

function scoreUnloading({
  ankleVelocity,
  upwardComVelocity,
  tripleExtensionScore
}) {
  /*
    First-pass unloading proxy.

    Future:
    - foot-ground distance
    - toe/heel lift
    - floor line estimate
    - manual take-off label correction
  */

  const ankleMotionScore = positiveScore(
    Math.abs(Number(ankleVelocity)),
    0.018
  );

  const upwardScore = positiveScore(upwardComVelocity, 0.015);

  const tripleScore = Number.isFinite(tripleExtensionScore)
    ? tripleExtensionScore
    : null;

  const values = [
    { value: ankleMotionScore, weight: 0.3 },
    { value: upwardScore, weight: 0.35 },
    { value: tripleScore, weight: 0.35 }
  ].filter(item => Number.isFinite(item.value));

  if (!values.length) return null;

  const totalWeight = values.reduce(
    (sum, item) => sum + item.weight,
    0
  );

  const score =
    values.reduce(
      (sum, item) => sum + item.value * item.weight,
      0
    ) / totalWeight;

  return round(clamp(score, 0, 1), 3);
}

function summarisePhaseSignals(frames) {
  return {
    frameCount: frames.length,

    maxTripleExtensionScore: maxOf(
      frames.map(frame => frame.tripleExtensionScore)
    ),

    maxUnloadingScore: maxOf(
      frames.map(frame => frame.unloadingScore)
    ),

    maxUpwardComVelocity: maxOf(
      frames.map(frame => frame.upwardComVelocity)
    ),

    minComY: minOf(
      frames.map(frame => frame.comY)
    ),

    maxComY: maxOf(
      frames.map(frame => frame.comY)
    )
  };
}

function buildFlags(frames) {
  const flags = [];

  if (!frames.length) {
    flags.push("no_phase_signal_frames");
    return flags;
  }

  const hasCom = frames.some(frame =>
    Number.isFinite(frame.comY)
  );

  const hasTripleExtension = frames.some(frame =>
    Number.isFinite(frame.tripleExtensionScore)
  );

  const strongTripleExtension = frames.some(frame =>
    Number(frame.tripleExtensionScore) >= 0.65
  );

  const strongUnloading = frames.some(frame =>
    Number(frame.unloadingScore) >= 0.65
  );

  if (!hasCom) flags.push("missing_com_proxy");
  if (!hasTripleExtension) flags.push("missing_triple_extension_signal");
  if (!strongTripleExtension) flags.push("no_strong_triple_extension_detected");
  if (!strongUnloading) flags.push("no_strong_unloading_detected");

  return flags;
}

function angleDelta(current, previous, fps) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return null;
  }

  const dt = 1 / (fps || 30);

  if (!Number.isFinite(dt) || dt <= 0) return null;

  return round((current - previous) / dt, 3);
}

function positiveScore(value, expectedStrongValue) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return 0;
  }

  return clamp(number / expectedStrongValue, 0, 1);
}

function average(values) {
  const cleanValues = values
    .map(Number)
    .filter(Number.isFinite);

  if (!cleanValues.length) return null;

  return round(
    cleanValues.reduce((sum, value) => sum + value, 0) /
      cleanValues.length,
    3
  );
}

function frameToTime(frameIndex, fps) {
  const frameRate = Number(fps);

  if (!Number.isFinite(frameRate) || frameRate <= 0) return null;

  return round(frameIndex / frameRate, 4);
}

function clean(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function maxOf(values) {
  const cleanValues = values
    .map(Number)
    .filter(Number.isFinite);

  if (!cleanValues.length) return null;

  return round(Math.max(...cleanValues), 4);
}

function minOf(values) {
  const cleanValues = values
    .map(Number)
    .filter(Number.isFinite);

  if (!cleanValues.length) return null;

  return round(Math.min(...cleanValues), 4);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, decimals = 3) {
  const number = Number(value);

  if (!Number.isFinite(number)) return null;

  const factor = Math.pow(10, decimals);
  return Math.round(number * factor) / factor;
}