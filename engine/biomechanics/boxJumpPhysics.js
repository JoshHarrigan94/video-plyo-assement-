/*
  boxJumpPhysics.js

  Purpose:
  Estimate box-jump physics without blindly applying
  same-height flight-time jump formulas.

  Box jumps are different because landing height is higher
  than take-off height.

  Core model:
    y(t) = y0 + v0t - 0.5gt²

  Therefore:
    landingHeightDelta = v0 * flightTime - 0.5g * flightTime²

  This module provides competing estimates and suppresses
  nonsense outputs when the estimates disagree.
*/

const GRAVITY = 9.80665;

export function estimateBoxJumpPhysics({
  takeoff = null,
  landing = null,
  centreOfMass = null,
  athlete = {}
}) {
  const flags = [];

  if (!takeoff || !landing) {
    return emptyEstimate("missing_takeoff_or_landing");
  }

  const flightTimeSec =
    landing.timeSec - takeoff.timeSec;

  if (!Number.isFinite(flightTimeSec) || flightTimeSec <= 0) {
    return emptyEstimate("invalid_flight_time");
  }

  const comFrames = centreOfMass?.frames || [];
  const comVelocity = centreOfMass?.velocity || [];

  const takeoffCom =
    nearestFrame(comFrames, takeoff.timeSec);

  const landingCom =
    nearestFrame(comFrames, landing.timeSec);

  const takeoffVelocity =
    estimateTakeoffVelocity({
      takeoff,
      comVelocity,
      centreOfMass
    });

  const fromComVelocity =
    estimateFromComVelocity({
      takeoffVelocity,
      flightTimeSec
    });

  const fromVisualComDisplacement =
    estimateFromVisualComDisplacement({
      takeoffCom,
      landingCom,
      athlete
    });

  const sameHeightFallback =
    estimateSameHeightFallback({
      flightTimeSec
    });

  const selectedEstimate =
    selectBestEstimate({
      fromComVelocity,
      fromVisualComDisplacement,
      sameHeightFallback
    });

  if (!fromComVelocity.available) {
    flags.push("takeoff_velocity_unavailable");
  }

  if (!fromVisualComDisplacement.available) {
    flags.push("visual_com_displacement_unavailable");
  }

  if (sameHeightFallback.available) {
    flags.push("same_height_formula_available_but_not_valid_for_box_jump");
  }

  if (!selectedEstimate.available) {
    flags.push("no_reliable_box_height_estimate");
  }

  if (
    selectedEstimate.available &&
    selectedEstimate.valueM > 1.6
  ) {
    flags.push("estimated_box_height_unusually_large");
  }

  return {
    status: selectedEstimate.available
      ? "estimated"
      : "insufficient_data",

    movementType: "box_jump",

    flightTimeSec: round(flightTimeSec, 4),

    takeoff: {
      timeSec: takeoff.timeSec,
      frameIndex: takeoff.frameIndex
    },

    landing: {
      timeSec: landing.timeSec,
      frameIndex: landing.frameIndex
    },

    methods: {
      fromComVelocity,
      fromVisualComDisplacement,
      sameHeightFallback
    },

    selectedEstimate,

    flags
  };
}

function estimateTakeoffVelocity({
  takeoff,
  comVelocity
}) {
  /*
    Image y axis:
    lower y = higher on screen.

    Upward velocity is negative vy.
    We convert to positive upward value.

    This is still in normalised video coordinates per second,
    unless later scaled to metres.
  */

  const windowSec = 0.18;

  const nearby = comVelocity.filter(frame => {
    if (!Number.isFinite(frame.timeSec)) return false;

    const dt = frame.timeSec - takeoff.timeSec;

    return dt >= -windowSec && dt <= windowSec;
  });

  const upwardValues = nearby
    .map(frame => -Number(frame.vy))
    .filter(Number.isFinite)
    .filter(value => value > 0);

  if (!upwardValues.length) {
    return {
      available: false,
      value: null,
      unit: "normalised_screen_units_per_second",
      flags: ["no_positive_com_velocity_near_takeoff"]
    };
  }

  const peak = Math.max(...upwardValues);

  return {
    available: true,
    value: round(peak, 5),
    unit: "normalised_screen_units_per_second",
    flags: ["requires_pixel_to_metre_scaling"]
  };
}

function estimateFromComVelocity({
  takeoffVelocity,
  flightTimeSec
}) {
  /*
    This method requires metre scaling.

    Until velocity is expressed in m/s, we cannot produce
    a true metre estimate from it.

    We still return diagnostic values because they are useful
    for confidence and future calibration.
  */

  if (!takeoffVelocity?.available) {
    return {
      available: false,
      valueM: null,
      confidence: 0,
      method: "com_velocity_projectile_model",
      flags: ["missing_takeoff_velocity"]
    };
  }

  return {
    available: false,
    valueM: null,
    diagnosticVelocity: takeoffVelocity.value,
    diagnosticUnit: takeoffVelocity.unit,
    flightTimeSec,
    confidence: 0.25,
    method: "com_velocity_projectile_model",
    flags: [
      "requires_pixel_to_metre_scaling",
      "not_selected_until_scaled"
    ]
  };
}

function estimateFromVisualComDisplacement({
  takeoffCom,
  landingCom,
  athlete
}) {
  /*
    Visual COM displacement can be estimated if we have:
    - COM at take-off
    - COM at landing
    - an approximate scale from athlete height

    This is only a rough estimate until we have:
    - camera calibration
    - ground/box surface reference
    - posture correction
  */

  if (
    !takeoffCom ||
    !landingCom ||
    !Number.isFinite(takeoffCom.y) ||
    !Number.isFinite(landingCom.y)
  ) {
    return {
      available: false,
      valueM: null,
      confidence: 0,
      method: "visual_com_displacement",
      flags: ["missing_takeoff_or_landing_com"]
    };
  }

  const heightM =
    athlete?.reference?.heightM ||
    athlete?.heightM ||
    null;

  if (!Number.isFinite(heightM)) {
    return {
      available: false,
      valueM: null,
      confidence: 0,
      method: "visual_com_displacement",
      flags: ["missing_athlete_height_scale"]
    };
  }

  /*
    Crude scaling assumption:
    visible body height roughly occupies 1.0 normalised screen unit
    when full body is visible.

    This will be replaced by actual landmark height scaling.
  */

  const normalisedDelta =
    takeoffCom.y - landingCom.y;

  const estimatedM =
    normalisedDelta * heightM;

  if (!Number.isFinite(estimatedM) || estimatedM <= 0) {
    return {
      available: false,
      valueM: null,
      confidence: 0.15,
      method: "visual_com_displacement",
      flags: [
        "non_positive_visual_com_delta",
        "landing_com_not_above_takeoff_com"
      ]
    };
  }

  return {
    available: true,
    valueM: round(estimatedM, 3),
    confidence: 0.35,
    method: "visual_com_displacement",
    flags: [
      "rough_height_scaled_estimate",
      "requires_camera_calibration",
      "requires_posture_correction"
    ]
  };
}

function estimateSameHeightFallback({
  flightTimeSec
}) {
  const heightM =
    (GRAVITY * flightTimeSec * flightTimeSec) / 8;

  return {
    available: true,
    valueM: round(heightM, 3),
    confidence: 0.05,
    method: "same_height_flight_time_formula",
    flags: [
      "not_valid_for_box_jump",
      "diagnostic_only"
    ]
  };
}

function selectBestEstimate({
  fromComVelocity,
  fromVisualComDisplacement,
  sameHeightFallback
}) {
  if (fromVisualComDisplacement.available) {
    return {
      available: true,
      valueM: fromVisualComDisplacement.valueM,
      confidence: fromVisualComDisplacement.confidence,
      method: fromVisualComDisplacement.method,
      flags: [
        ...fromVisualComDisplacement.flags,
        "selected_visual_com_estimate"
      ]
    };
  }

  return {
    available: false,
    valueM: null,
    confidence: 0,
    method: null,
    flags: [
      "no_valid_selected_estimate",
      "same_height_fallback_suppressed"
    ]
  };
}

function nearestFrame(frames, timeSec) {
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

function emptyEstimate(flag) {
  return {
    status: "insufficient_data",
    movementType: "box_jump",
    flightTimeSec: null,
    methods: {},
    selectedEstimate: {
      available: false,
      valueM: null,
      confidence: 0,
      method: null,
      flags: [flag]
    },
    flags: [flag]
  };
}

function round(value, decimals = 3) {
  const number = Number(value);

  if (!Number.isFinite(number)) return null;

  const factor = Math.pow(10, decimals);
  return Math.round(number * factor) / factor;
}