/*
  centreOfMass.js

  Purpose:

  Estimate athlete centre of mass (COM)
  from MediaPipe landmarks.

  This becomes the primary movement signal
  for jump detection.

  Future versions:
  - anthropometric weighting
  - segment lengths
  - athlete sex scaling
  - whole-body COM modelling
  - force estimation

  Current version:
  - simplified visual COM model
*/

export function buildCentreOfMassTrajectory({
  landmarksByFrame = [],
  athlete = {}
}) {
  const frames = [];

  for (const frame of landmarksByFrame) {
    const landmarks = frame.landmarks || [];

    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];

    const leftHip = landmarks[23];
    const rightHip = landmarks[24];

    const leftKnee = landmarks[25];
    const rightKnee = landmarks[26];

    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];

    const torsoCentre = midpoint(
      midpointPoint(leftShoulder, rightShoulder),
      midpointPoint(leftHip, rightHip)
    );

    const hipCentre = midpointPoint(
      leftHip,
      rightHip
    );

    const kneeCentre = midpointPoint(
      leftKnee,
      rightKnee
    );

    const ankleCentre = midpointPoint(
      leftAnkle,
      rightAnkle
    );

    const com = weightedPoint([
      {
        point: torsoCentre,
        weight: 0.55
      },
      {
        point: hipCentre,
        weight: 0.25
      },
      {
        point: kneeCentre,
        weight: 0.15
      },
      {
        point: ankleCentre,
        weight: 0.05
      }
    ]);

    frames.push({
      frameIndex: frame.frameIndex,
      timeSec: frame.timeSec,
      timestampMs: frame.timestampMs,

      x: com?.x ?? null,
      y: com?.y ?? null,
      z: com?.z ?? null
    });
  }

  const velocity = calculateVelocity(frames);
  const acceleration = calculateAcceleration(velocity);

  return {
    frames,
    velocity,
    acceleration,

    summary: {
      verticalDisplacement:
        calculateVerticalDisplacement(frames),

      maxUpwardVelocity:
        maxUpwardVelocity(velocity),

      maxDownwardVelocity:
        maxDownwardVelocity(velocity),

      peakAcceleration:
        peakAcceleration(acceleration)
    }
  };
}

function calculateVelocity(frames) {
  const velocity = [];

  for (let i = 0; i < frames.length; i++) {
    const current = frames[i];
    const previous = frames[i - 1];

    if (!previous) {
      velocity.push({
        frameIndex: current.frameIndex,
        timeSec: current.timeSec,
        vx: null,
        vy: null,
        vz: null
      });

      continue;
    }

    const dt =
      current.timeSec -
      previous.timeSec;

    if (!Number.isFinite(dt) || dt <= 0) {
      velocity.push({
        frameIndex: current.frameIndex,
        timeSec: current.timeSec,
        vx: null,
        vy: null,
        vz: null
      });

      continue;
    }

    velocity.push({
      frameIndex: current.frameIndex,
      timeSec: current.timeSec,

      vx: derivative(
        current.x,
        previous.x,
        dt
      ),

      vy: derivative(
        current.y,
        previous.y,
        dt
      ),

      vz: derivative(
        current.z,
        previous.z,
        dt
      )
    });
  }

  return velocity;
}

function calculateAcceleration(velocity) {
  const acceleration = [];

  for (let i = 0; i < velocity.length; i++) {
    const current = velocity[i];
    const previous = velocity[i - 1];

    if (!previous) {
      acceleration.push({
        frameIndex: current.frameIndex,
        timeSec: current.timeSec,
        ax: null,
        ay: null,
        az: null
      });

      continue;
    }

    const dt =
      current.timeSec -
      previous.timeSec;

    if (!Number.isFinite(dt) || dt <= 0) {
      acceleration.push({
        frameIndex: current.frameIndex,
        timeSec: current.timeSec,
        ax: null,
        ay: null,
        az: null
      });

      continue;
    }

    acceleration.push({
      frameIndex: current.frameIndex,
      timeSec: current.timeSec,

      ax: derivative(
        current.vx,
        previous.vx,
        dt
      ),

      ay: derivative(
        current.vy,
        previous.vy,
        dt
      ),

      az: derivative(
        current.vz,
        previous.vz,
        dt
      )
    });
  }

  return acceleration;
}

function calculateVerticalDisplacement(frames) {
  const values = frames
    .map(frame => frame.y)
    .filter(Number.isFinite);

  if (!values.length) return null;

  return round(
    Math.max(...values) -
      Math.min(...values),
    5
  );
}

function maxUpwardVelocity(velocity) {
  const values = velocity
    .map(v => v.vy)
    .filter(Number.isFinite);

  if (!values.length) return null;

  return round(
    Math.min(...values),
    5
  );
}

function maxDownwardVelocity(velocity) {
  const values = velocity
    .map(v => v.vy)
    .filter(Number.isFinite);

  if (!values.length) return null;

  return round(
    Math.max(...values),
    5
  );
}

function peakAcceleration(acceleration) {
  const values = acceleration
    .map(a => a.ay)
    .filter(Number.isFinite);

  if (!values.length) return null;

  return round(
    Math.max(
      ...values.map(Math.abs)
    ),
    5
  );
}

function weightedPoint(items) {
  const valid = items.filter(
    item =>
      item.point &&
      Number.isFinite(item.point.x) &&
      Number.isFinite(item.point.y)
  );

  if (!valid.length) return null;

  const totalWeight =
    valid.reduce(
      (sum, item) =>
        sum + item.weight,
      0
    );

  return {
    x:
      valid.reduce(
        (sum, item) =>
          sum +
          item.point.x *
            item.weight,
        0
      ) / totalWeight,

    y:
      valid.reduce(
        (sum, item) =>
          sum +
          item.point.y *
            item.weight,
        0
      ) / totalWeight,

    z:
      valid.reduce(
        (sum, item) =>
          sum +
          (item.point.z || 0) *
            item.weight,
        0
      ) / totalWeight
  };
}

function midpointPoint(a, b) {
  if (!a || !b) return null;

  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: ((a.z || 0) + (b.z || 0)) / 2
  };
}

function midpoint(a, b) {
  if (!a || !b) return null;

  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: ((a.z || 0) + (b.z || 0)) / 2
  };
}

function derivative(current, previous, dt) {
  if (
    !Number.isFinite(current) ||
    !Number.isFinite(previous)
  ) {
    return null;
  }

  return round(
    (current - previous) / dt,
    5
  );
}

function round(value, decimals = 5) {
  const factor =
    Math.pow(10, decimals);

  return (
    Math.round(value * factor) /
    factor
  );
}