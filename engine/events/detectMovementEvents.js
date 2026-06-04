export async function detectMovementEvents(analysis) {
  const signals = analysis.signals || {};
  const joints = signals.joints || {};
  const velocities = signals.velocities || {};

  const hipY = joints.hipY || [];
  const ankleY = joints.ankleY || [];
  const hipVelocity = velocities.hipVelocity || [];
  const ankleVelocity = velocities.ankleVelocity || [];

  if (!hipY.length && !ankleY.length) {
    analysis.events.status = "skipped";
    analysis.events.flags.push("event_detection_skipped_no_signals");

    analysis.logs.push({
      time: new Date().toISOString(),
      level: "warn",
      module: "events",
      message: "Event detection skipped because no usable joint signals exist."
    });

    return analysis;
  }

  analysis.events.status = "running";

  /*
    v0.1 event detector.

    This is intentionally conservative.

    Future versions will detect:
    - take-off
    - landing
    - ground contact windows
    - flight windows
    - repeated-contact rhythm
    - ambiguous event windows for ML refinement
  */

  const candidates = [];

  const motionSignal = buildMotionSignal({
    hipY,
    ankleY,
    hipVelocity,
    ankleVelocity
  });

  for (let i = 1; i < motionSignal.length - 1; i++) {
    const previous = motionSignal[i - 1];
    const current = motionSignal[i];
    const next = motionSignal[i + 1];

    if (!Number.isFinite(previous.value) || !Number.isFinite(current.value) || !Number.isFinite(next.value)) {
      continue;
    }

    const isLocalPeak =
      current.value > previous.value &&
      current.value > next.value;

    const isLocalTrough =
      current.value < previous.value &&
      current.value < next.value;

    if (isLocalPeak || isLocalTrough) {
      candidates.push({
        id: `event_candidate_${candidates.length + 1}`,
        frameIndex: i,
        timeSec: frameToTime(i, analysis.video.fps),
        type: isLocalPeak ? "motion_peak" : "motion_trough",
        source: "pose_signal",
        confidence: 0.35,
        refined: false,
        flags: ["coarse_candidate"]
      });
    }
  }

  analysis.events.candidates = candidates;
  analysis.events.final = [];
  analysis.events.takeOffs = [];
  analysis.events.landings = [];
  analysis.events.contacts = [];

  analysis.events.flags.push("event_detection_placeholder_logic");

  analysis.events.status = "complete";

  analysis.logs.push({
    time: new Date().toISOString(),
    level: "info",
    module: "events",
    message: `Movement event detection completed with ${candidates.length} candidate(s).`
  });

  return analysis;
}

function buildMotionSignal({ hipY, ankleY, hipVelocity, ankleVelocity }) {
  const length = Math.max(
    hipY.length,
    ankleY.length,
    hipVelocity.length,
    ankleVelocity.length
  );

  const signal = [];

  for (let i = 0; i < length; i++) {
    const values = [
      absOrNull(hipVelocity[i]),
      absOrNull(ankleVelocity[i])
    ].filter(Number.isFinite);

    const value = values.length
      ? values.reduce((sum, current) => sum + current, 0) / values.length
      : null;

    signal.push({
      frameIndex: i,
      value
    });
  }

  return signal;
}

function frameToTime(frameIndex, fps) {
  const frameRate = Number(fps);

  if (!Number.isFinite(frameRate) || frameRate <= 0) {
    return null;
  }

  return frameIndex / frameRate;
}

function absOrNull(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) return null;

  return Math.abs(number);
}
