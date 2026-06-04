export function buildMovementSeries({ joints, velocities, angles }) {
  const hipY = joints.hipY || [];
  const ankleY = joints.ankleY || [];
  const kneeY = joints.kneeY || [];

  const hipVelocity = velocities.hipVelocity || [];
  const ankleVelocity = velocities.ankleVelocity || [];
  const kneeVelocity = velocities.kneeVelocity || [];

  const leftKnee = angles.leftKneeAngle || [];
  const rightKnee = angles.rightKneeAngle || [];

  const length = Math.max(
    hipY.length,
    ankleY.length,
    kneeY.length,
    hipVelocity.length,
    ankleVelocity.length,
    kneeVelocity.length
  );

  const series = [];

  for (let i = 0; i < length; i++) {
    const hipVel = clean(hipVelocity[i]);
    const ankleVel = clean(ankleVelocity[i]);
    const kneeVel = clean(kneeVelocity[i]);

    series.push({
      frameIndex: i,
      hipY: clean(hipY[i]),
      kneeY: clean(kneeY[i]),
      ankleY: clean(ankleY[i]),

      hipVelocity: hipVel,
      kneeVelocity: kneeVel,
      ankleVelocity: ankleVel,

      upwardDrive: Number.isFinite(hipVel) ? -hipVel : 0,
      downwardMotion: Number.isFinite(hipVel) ? hipVel : 0,
      footMotion: Number.isFinite(ankleVel) ? Math.abs(ankleVel) : 0,

      kneeAngle: average([leftKnee[i], rightKnee[i]])
    });
  }

  return series;
}

export function makeEvent({
  id,
  type,
  frameIndex,
  fps,
  timeSec = null,
  confidence,
  source,
  flags = []
}) {
  return {
    id,
    type,
    frameIndex,
    timeSec:
      Number.isFinite(timeSec)
        ? timeSec
        : frameToTime(frameIndex, fps),
    confidence,
    source,
    refined: false,
    flags
  };
}

export function buildContactWindows(landings, takeOffs) {
  const contacts = [];

  for (const landing of landings) {
    const nextTakeoff = takeOffs.find(
      takeoff => takeoff.frameIndex > landing.frameIndex
    );

    if (!nextTakeoff) continue;

    const durationSec = nextTakeoff.timeSec - landing.timeSec;

    if (!Number.isFinite(durationSec) || durationSec <= 0) continue;

    contacts.push({
      id: `contact_${contacts.length + 1}`,
      type: "contact_window_candidate",
      startFrame: landing.frameIndex,
      endFrame: nextTakeoff.frameIndex,
      startTimeSec: landing.timeSec,
      endTimeSec: nextTakeoff.timeSec,
      durationSec: round(durationSec, 4),
      confidence: Math.min(landing.confidence, nextTakeoff.confidence),
      source: "landing_to_next_takeoff",
      flags: ["candidate_contact_window"]
    });
  }

  return contacts;
}

export function nearestAudioImpact(timeSec, impacts = []) {
  if (!Number.isFinite(timeSec) || !impacts.length) return null;

  let nearest = null;
  let nearestDelta = Infinity;

  for (const impact of impacts) {
    const delta = Math.abs(impact.timeSec - timeSec);

    if (delta < nearestDelta) {
      nearest = impact;
      nearestDelta = delta;
    }
  }

  return nearest;
}

export function percentile(values, p) {
  const cleanValues = values
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  if (!cleanValues.length) return Infinity;

  const index = Math.floor((p / 100) * (cleanValues.length - 1));
  return cleanValues[index];
}

export function average(values) {
  const cleanValues = values
    .map(Number)
    .filter(Number.isFinite);

  if (!cleanValues.length) return null;

  return cleanValues.reduce((sum, value) => sum + value, 0) / cleanValues.length;
}

export function frameToTime(frameIndex, fps) {
  const frameRate = Number(fps);

  if (!Number.isFinite(frameRate) || frameRate <= 0) return null;

  return round(frameIndex / frameRate, 4);
}

export function round(value, decimals = 3) {
  const number = Number(value);

  if (!Number.isFinite(number)) return null;

  const factor = Math.pow(10, decimals);
  return Math.round(number * factor) / factor;
}

function clean(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
