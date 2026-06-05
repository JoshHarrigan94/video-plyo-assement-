/*
  forceTimeProxy.js

  Purpose:
  Build a video-derived force-time proxy curve from COM and phase signals.

  This is not true force yet.

  It is a pattern-detection layer designed to identify:
  - unweighting
  - dominant propulsive impulse
  - take-off
  - flight
  - landing impact
  - stabilisation

  The goal is to detect the main jump occurrence from the force-time shape,
  rather than treating every state transition as an event.
*/

export function buildForceTimeProxy({
  centreOfMass = null,
  phaseFrames = [],
  athlete = {},
  audioImpacts = []
}) {
  const comFrames = centreOfMass?.frames || [];
  const comVelocity = centreOfMass?.velocity || [];
  const comAcceleration = centreOfMass?.acceleration || [];

  if (!comFrames.length || !phaseFrames.length) {
    return emptyResult("missing_com_or_phase_frames");
  }

  const curve = buildCurve({
    comFrames,
    comVelocity,
    comAcceleration,
    phaseFrames,
    athlete
  });

  const smoothedCurve = smoothCurve(curve);

  const events = detectForceTimeEvents({
    curve: smoothedCurve,
    audioImpacts
  });

  const selectedJumpBout = buildSelectedJumpBout({
    events,
    curve: smoothedCurve,
    audioImpacts
  });

  return {
    status: selectedJumpBout
      ? "complete"
      : "no_jump_bout_selected",

    curve: smoothedCurve,
    events,
    impulse: calculateImpulseSummary(smoothedCurve, events),
    selectedJumpBout,

    summary: {
      frameCount: smoothedCurve.length,
      maxForceProxy: maxOf(smoothedCurve.map(point => point.forceProxy)),
      minForceProxy: minOf(smoothedCurve.map(point => point.forceProxy)),
      maxPropulsiveScore: maxOf(smoothedCurve.map(point => point.propulsiveScore)),
      maxLandingScore: maxOf(smoothedCurve.map(point => point.landingScore)),
      hasSelectedJumpBout: Boolean(selectedJumpBout)
    },

    flags: buildFlags({
      curve: smoothedCurve,
      events,
      selectedJumpBout
    })
  };
}

function buildCurve({
  comFrames,
  comVelocity,
  comAcceleration,
  phaseFrames,
  athlete
}) {
  const bodyMassKg =
    athlete?.reference?.weightKg ||
    athlete?.weightKg ||
    null;

  const massScale =
    Number.isFinite(bodyMassKg) && bodyMassKg > 0
      ? bodyMassKg / 100
      : 1;

  return comFrames.map((comFrame, index) => {
    const phase = nearestByTime(phaseFrames, comFrame.timeSec);
    const velocity = comVelocity[index] || {};
    const acceleration = comAcceleration[index] || {};

    /*
      Image coordinate system:
      y increasing = down
      y decreasing = up

      Upward acceleration proxy = -ay.
    */

    const upwardAcceleration =
      Number.isFinite(acceleration.ay)
        ? -acceleration.ay
        : null;

    const upwardVelocity =
      Number.isFinite(velocity.vy)
        ? -velocity.vy
        : null;

    const triple =
      safe(phase?.tripleExtensionScore);

    const unloading =
      safe(phase?.unloadingScore);

    const propulsiveScore = scorePropulsion({
      upwardAcceleration,
      upwardVelocity,
      triple,
      unloading
    });

    const unloadingScore = scoreUnweighting({
      upwardAcceleration,
      upwardVelocity,
      unloading
    });

    const landingScore = scoreLanding({
      upwardAcceleration,
      upwardVelocity,
      phase
    });

    /*
      forceProxy is intentionally unitless.

      It combines acceleration-like COM behaviour with
      biomechanical evidence that the athlete is extending.
    */

    const forceProxy = round(
      (
        1 +
        propulsiveScore * 2.2 -
        unloadingScore * 0.9 +
        landingScore * 2.4
      ) * massScale,
      4
    );

    return {
      frameIndex: comFrame.frameIndex,
      timeSec: comFrame.timeSec,

      comY: comFrame.y,
      upwardVelocity,
      upwardAcceleration,

      tripleExtensionScore: triple,
      unloadingScore: unloading,

      propulsiveScore,
      unweightingScore: unloadingScore,
      landingScore,

      forceProxy
    };
  });
}

function scorePropulsion({
  upwardAcceleration,
  upwardVelocity,
  triple,
  unloading
}) {
  const accelScore = positiveScore(upwardAcceleration, 0.25);
  const velocityScore = positiveScore(upwardVelocity, 0.35);

  return weightedScore([
    { value: accelScore, weight: 0.35 },
    { value: velocityScore, weight: 0.25 },
    { value: triple, weight: 0.25 },
    { value: unloading, weight: 0.15 }
  ]);
}

function scoreUnweighting({
  upwardAcceleration,
  upwardVelocity,
  unloading
}) {
  /*
    Unweighting/rocking can include reduced apparent support
    and downward or low upward acceleration before propulsion.
  */

  const downwardOrLowAccel =
    Number.isFinite(upwardAcceleration)
      ? clamp(-upwardAcceleration / 0.2, 0, 1)
      : 0;

  const lowVelocity =
    Number.isFinite(upwardVelocity)
      ? clamp(1 - Math.abs(upwardVelocity) / 0.25, 0, 1)
      : 0;

  return weightedScore([
    { value: downwardOrLowAccel, weight: 0.4 },
    { value: lowVelocity, weight: 0.2 },
    { value: unloading, weight: 0.4 }
  ]);
}

function scoreLanding({
  upwardAcceleration,
  upwardVelocity,
  phase
}) {
  /*
    Landing impact usually appears as:
    - downward velocity before contact
    - rapid upward/deceleration signal
    - high foot/ankle disturbance
  */

  const downwardVelocityScore =
    Number.isFinite(upwardVelocity)
      ? clamp(-upwardVelocity / 0.35, 0, 1)
      : 0;

  const impactAccelScore =
    Number.isFinite(upwardAcceleration)
      ? clamp(Math.abs(upwardAcceleration) / 0.35, 0, 1)
      : 0;

  const ankleDisturbance =
    Number.isFinite(phase?.ankleVelocity)
      ? clamp(Math.abs(phase.ankleVelocity) / 0.08, 0, 1)
      : 0;

  return weightedScore([
    { value: downwardVelocityScore, weight: 0.35 },
    { value: impactAccelScore, weight: 0.45 },
    { value: ankleDisturbance, weight: 0.2 }
  ]);
}

function smoothCurve(curve) {
  return curve.map((point, index) => {
    const window = curve.slice(
      Math.max(0, index - 1),
      Math.min(curve.length, index + 2)
    );

    return {
      ...point,
      forceProxy: round(mean(window.map(item => item.forceProxy)), 4),
      propulsiveScore: round(mean(window.map(item => item.propulsiveScore)), 4),
      landingScore: round(mean(window.map(item => item.landingScore)), 4),
      unweightingScore: round(mean(window.map(item => item.unweightingScore)), 4)
    };
  });
}

function detectForceTimeEvents({
  curve,
  audioImpacts
}) {
  const propulsivePeak = findDominantPeak({
    curve,
    key: "propulsiveScore",
    minValue: 0.38,
    preferLaterThanSec: 0.4
  });

  const unweighting = propulsivePeak
    ? findPrecedingMinimum({
        curve,
        key: "forceProxy",
        beforeTimeSec: propulsivePeak.timeSec,
        maxLookbackSec: 1.5
      })
    : null;

  const takeoff = propulsivePeak
    ? findTakeoffAfterPropulsion({
        curve,
        propulsivePeak
      })
    : null;

  const landingImpact = takeoff
    ? findLandingAfterTakeoff({
        curve,
        takeoff,
        audioImpacts
      })
    : null;

  const flight = takeoff && landingImpact
    ? {
        startTimeSec: takeoff.timeSec,
        endTimeSec: landingImpact.timeSec,
        durationSec: round(landingImpact.timeSec - takeoff.timeSec, 4),
        confidence: Math.min(takeoff.confidence, landingImpact.confidence)
      }
    : null;

  return {
    unweighting,
    propulsivePeak,
    takeoff,
    flight,
    landingImpact
  };
}

function findDominantPeak({
  curve,
  key,
  minValue,
  preferLaterThanSec = 0
}) {
  const candidates = [];

  for (let i = 1; i < curve.length - 1; i++) {
    const previous = curve[i - 1];
    const current = curve[i];
    const next = curve[i + 1];

    const value = safe(current[key]);

    const isPeak =
      value >= minValue &&
      value >= safe(previous[key]) &&
      value >= safe(next[key]) &&
      current.timeSec >= preferLaterThanSec;

    if (!isPeak) continue;

    candidates.push({
      frameIndex: current.frameIndex,
      timeSec: current.timeSec,
      value,
      confidence: clamp(value, 0, 1),
      point: current
    });
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => b.value - a.value);

  return {
    type: "propulsive_peak",
    ...candidates[0],
    flags: ["dominant_propulsive_peak"]
  };
}

function findPrecedingMinimum({
  curve,
  key,
  beforeTimeSec,
  maxLookbackSec
}) {
  const window = curve.filter(point =>
    point.timeSec < beforeTimeSec &&
    point.timeSec >= beforeTimeSec - maxLookbackSec
  );

  if (!window.length) return null;

  let best = window[0];

  for (const point of window) {
    if (safe(point[key]) < safe(best[key])) {
      best = point;
    }
  }

  return {
    type: "unweighting_minimum",
    frameIndex: best.frameIndex,
    timeSec: best.timeSec,
    value: best[key],
    confidence: 0.45,
    point: best,
    flags: ["pre_propulsive_force_minimum"]
  };
}

function findTakeoffAfterPropulsion({
  curve,
  propulsivePeak
}) {
  const window = curve.filter(point =>
    point.timeSec >= propulsivePeak.timeSec &&
    point.timeSec <= propulsivePeak.timeSec + 0.6
  );

  if (!window.length) return null;

  /*
    In a true force curve, takeoff is where force drops near zero.
    In our proxy, we look for a drop after the propulsive peak
    plus high unloading / low force evidence.
  */

  const peakForce = propulsivePeak.point.forceProxy;
  const dropThreshold = peakForce * 0.55;

  let best = null;

  for (const point of window) {
    const forceDrop =
      point.forceProxy <= dropThreshold;

    const highUnweighting =
      point.unweightingScore >= 0.45;

    if (!forceDrop && !highUnweighting) continue;

    best = point;
    break;
  }

  if (!best) {
    best = propulsivePeak.point;
  }

  return {
    type: "takeoff",
    frameIndex: best.frameIndex,
    timeSec: best.timeSec,
    value: best.forceProxy,
    confidence: 0.58,
    point: best,
    flags: ["post_propulsive_force_drop_or_peak"]
  };
}

function findLandingAfterTakeoff({
  curve,
  takeoff,
  audioImpacts
}) {
  const minFlightSec = 0.22;
  const maxFlightSec = 1.0;

  const window = curve.filter(point =>
    point.timeSec >= takeoff.timeSec + minFlightSec &&
    point.timeSec <= takeoff.timeSec + maxFlightSec
  );

  if (!window.length) return null;

  let best = null;

  const hasStartedDescending =
  Number.isFinite(point.upwardVelocity) &&
  point.upwardVelocity <= 0.05;

  for (const point of window) {
    const candidateScore =
      point.landingScore * 0.65 +
      positiveScore(point.forceProxy, 2.2) * 0.35;

    if (candidateScore >= 0.35 && hasStartedDescending) {
  best = {
    point,
    score: candidateScore
  };

  break;
}
  }

  if (!best || best.score < 0.35) {
    const audio = audioImpacts.find(impact => {
      const dt = impact.timeSec - takeoff.timeSec;
      return dt >= minFlightSec && dt <= maxFlightSec;
    });

    if (!audio) return null;

    return {
      type: "landing_impact",
      frameIndex: null,
      timeSec: audio.timeSec,
      value: audio.rms,
      confidence: 0.55,
      point: null,
      audioValidation: {
        status: "matched",
        nearestImpact: audio,
        deltaSec: 0
      },
      flags: ["audio_landing_fallback"]
    };
  }

  const nearestAudio = nearestAudioImpact(
    best.point.timeSec,
    audioImpacts
  );

  const audioDelta =
    nearestAudio
      ? Math.abs(nearestAudio.timeSec - best.point.timeSec)
      : null;

  const audioMatched =
    Number.isFinite(audioDelta) &&
    audioDelta <= 0.18;

  return {
    type: "landing_impact",
    frameIndex: best.point.frameIndex,
    timeSec: best.point.timeSec,
    value: best.point.forceProxy,
    confidence: round(
      clamp(best.score + (audioMatched ? 0.15 : 0), 0.35, 0.92),
      2
    ),
    point: best.point,
    audioValidation: nearestAudio
      ? {
          status: audioMatched ? "matched" : "not_matched",
          nearestImpact: nearestAudio,
          deltaSec: round(audioDelta, 4)
        }
      : null,
    flags: audioMatched
      ? ["dominant_landing_impact", "audio_validated"]
      : ["dominant_landing_impact"]
  };
}

function buildSelectedJumpBout({
  events,
  curve
}) {
  if (!events.propulsivePeak || !events.takeoff || !events.landingImpact) {
    return null;
  }

  const duration =
    events.landingImpact.timeSec -
    events.takeoff.timeSec;

  if (!Number.isFinite(duration) || duration <= 0) return null;

  const propulsiveArea = integrateWindow({
    curve,
    startTimeSec: events.unweighting?.timeSec ?? events.propulsivePeak.timeSec,
    endTimeSec: events.takeoff.timeSec,
    key: "forceProxy"
  });

  const score = weightedScore([
    { value: events.propulsivePeak.confidence, weight: 0.35 },
    { value: events.takeoff.confidence, weight: 0.25 },
    { value: events.landingImpact.confidence, weight: 0.25 },
    { value: duration >= 0.12 && duration <= 1.6 ? 1 : 0, weight: 0.15 }
  ]);

  return {
    type: "selected_jump_bout",
    takeoffTimeSec: events.takeoff.timeSec,
    landingTimeSec: events.landingImpact.timeSec,
    flightDurationSec: round(duration, 4),

    takeoffFrame: events.takeoff.frameIndex,
    landingFrame: events.landingImpact.frameIndex,

    propulsivePeakTimeSec: events.propulsivePeak.timeSec,
    unweightingTimeSec: events.unweighting?.timeSec ?? null,

    propulsiveImpulseProxy: propulsiveArea,

    score: round(score, 3),
    confidence: round(clamp(score, 0, 1), 3),

    flags: ["dominant_force_time_bout_selected"]
  };
}

function calculateImpulseSummary(curve, events) {
  if (!events?.propulsivePeak || !events?.takeoff) {
    return {
      propulsiveArea: null,
      landingArea: null
    };
  }

  return {
    propulsiveArea: integrateWindow({
      curve,
      startTimeSec: events.unweighting?.timeSec ?? events.propulsivePeak.timeSec,
      endTimeSec: events.takeoff.timeSec,
      key: "forceProxy"
    }),

    landingArea: events.landingImpact
      ? integrateWindow({
          curve,
          startTimeSec: events.landingImpact.timeSec - 0.15,
          endTimeSec: events.landingImpact.timeSec + 0.15,
          key: "forceProxy"
        })
      : null
  };
}

function integrateWindow({
  curve,
  startTimeSec,
  endTimeSec,
  key
}) {
  const points = curve.filter(point =>
    point.timeSec >= startTimeSec &&
    point.timeSec <= endTimeSec
  );

  if (points.length < 2) return null;

  let area = 0;

  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1];
    const current = points[i];

    const dt = current.timeSec - previous.timeSec;

    if (!Number.isFinite(dt) || dt <= 0) continue;

    area += ((safe(previous[key]) + safe(current[key])) / 2) * dt;
  }

  return round(area, 4);
}

function buildFlags({
  curve,
  events,
  selectedJumpBout
}) {
  const flags = [
    "force_time_proxy_v0_1",
    "unitless_video_derived_force_proxy"
  ];

  if (!curve.length) flags.push("empty_force_time_curve");
  if (!events.propulsivePeak) flags.push("no_propulsive_peak_detected");
  if (!events.takeoff) flags.push("no_takeoff_detected_from_force_proxy");
  if (!events.landingImpact) flags.push("no_landing_detected_from_force_proxy");
  if (!selectedJumpBout) flags.push("no_selected_jump_bout");

  return flags;
}

function nearestByTime(frames, timeSec) {
  if (!frames?.length || !Number.isFinite(timeSec)) return null;

  let best = null;
  let bestDelta = Infinity;

  for (const frame of frames) {
    const delta = Math.abs(frame.timeSec - timeSec);

    if (delta < bestDelta) {
      best = frame;
      bestDelta = delta;
    }
  }

  return best;
}

function nearestAudioImpact(timeSec, impacts = []) {
  if (!Number.isFinite(timeSec) || !impacts.length) return null;

  let best = null;
  let bestDelta = Infinity;

  for (const impact of impacts) {
    const delta = Math.abs(impact.timeSec - timeSec);

    if (delta < bestDelta) {
      best = impact;
      bestDelta = delta;
    }
  }

  return best;
}

function positiveScore(value, strongValue) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) return 0;

  return clamp(number / strongValue, 0, 1);
}

function weightedScore(items) {
  const valid = items.filter(item =>
    Number.isFinite(item.value) &&
    Number.isFinite(item.weight)
  );

  if (!valid.length) return 0;

  const totalWeight = valid.reduce(
    (sum, item) => sum + item.weight,
    0
  );

  if (!totalWeight) return 0;

  return clamp(
    valid.reduce(
      (sum, item) => sum + item.value * item.weight,
      0
    ) / totalWeight,
    0,
    1
  );
}

function mean(values) {
  const clean = values
    .map(Number)
    .filter(Number.isFinite);

  if (!clean.length) return null;

  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function maxOf(values) {
  const clean = values
    .map(Number)
    .filter(Number.isFinite);

  if (!clean.length) return null;

  return round(Math.max(...clean), 4);
}

function minOf(values) {
  const clean = values
    .map(Number)
    .filter(Number.isFinite);

  if (!clean.length) return null;

  return round(Math.min(...clean), 4);
}

function safe(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function emptyResult(flag) {
  return {
    status: "insufficient_data",
    curve: [],
    events: {},
    impulse: {},
    selectedJumpBout: null,
    summary: {
      frameCount: 0,
      hasSelectedJumpBout: false
    },
    flags: [
      "force_time_proxy_v0_1",
      flag
    ]
  };
}

function round(value, decimals = 3) {
  const number = Number(value);

  if (!Number.isFinite(number)) return null;

  const factor = Math.pow(10, decimals);
  return Math.round(number * factor) / factor;
}