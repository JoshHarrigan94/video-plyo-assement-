/*
  movementStateMachine.js

  Purpose:

  Convert biomechanical signals into
  meaningful movement states.

  This becomes the backbone of all
  jump classification and event detection.

  Future:
  - movement-specific state machines
  - sprint states
  - change-of-direction states
  - bounding states
  - drop jump states

  Current:
  Generic vertical jump state machine.
*/

const STATES = {
  UNKNOWN: "UNKNOWN",

  SETUP: "SETUP",

  PRELOAD: "PRELOAD",

  PROPULSION: "PROPULSION",

  TAKEOFF: "TAKEOFF",

  FLIGHT: "FLIGHT",

  LANDING: "LANDING",

  STABILISATION: "STABILISATION"
};

export function buildMovementStateMachine({
  phaseFrames = [],
  com = null
}) {
  if (!phaseFrames.length) {
    return {
      states: [],
      transitions: [],
      summary: {},
      flags: ["no_phase_frames"]
    };
  }

  const states = [];

  let currentState = STATES.SETUP;

  for (let i = 0; i < phaseFrames.length; i++) {
    const frame = phaseFrames[i];

    const nextState = determineState({
      frame,
      currentState
    });

    states.push({
      frameIndex: frame.frameIndex,
      timeSec: frame.timeSec,
      state: nextState,

      tripleExtensionScore:
        frame.tripleExtensionScore,

      unloadingScore:
        frame.unloadingScore,

      upwardComVelocity:
        frame.upwardComVelocity,

      comY:
        frame.comY
    });

    currentState = nextState;
  }

  const transitions =
    extractTransitions(states);

  return {
    states,
    transitions,

    summary: buildSummary({
      states,
      transitions
    }),

    flags: buildFlags({
      states,
      transitions
    })
  };
}

function determineState({
  frame,
  currentState
}) {
  const triple =
    safe(frame.tripleExtensionScore);

  const unloading =
    safe(frame.unloadingScore);

  const upward =
    safe(frame.upwardComVelocity);

  /*
    Flight state
  */

  if (
    unloading > 0.75 &&
    triple > 0.7 &&
    upward > 0.02
  ) {
    return STATES.TAKEOFF;
  }

  if (
    unloading > 0.7 &&
    upward > 0.015
  ) {
    return STATES.FLIGHT;
  }

  /*
    Landing
  */

  if (
    upward < -0.01
  ) {
    return STATES.LANDING;
  }

  /*
    Propulsion
  */

  if (
    triple > 0.55 &&
    upward > 0.005
  ) {
    return STATES.PROPULSION;
  }

  /*
    Preload
  */

  if (
    triple > 0.2 ||
    unloading > 0.2
  ) {
    return STATES.PRELOAD;
  }

  /*
    Stabilisation
  */

  if (
    currentState === STATES.LANDING &&
    Math.abs(upward) < 0.003
  ) {
    return STATES.STABILISATION;
  }

  return STATES.SETUP;
}

function extractTransitions(states) {
  const transitions = [];

  for (let i = 1; i < states.length; i++) {
    const previous = states[i - 1];
    const current = states[i];

    if (
      previous.state !== current.state
    ) {
      transitions.push({
        from: previous.state,
        to: current.state,

        frameIndex:
          current.frameIndex,

        timeSec:
          current.timeSec
      });
    }
  }

  return transitions;
}

function buildSummary({
  states,
  transitions
}) {
  const counts = {};

  for (const state of states) {
    counts[state.state] =
      (counts[state.state] || 0) + 1;
  }

  return {
    totalFrames:
      states.length,

    transitions:
      transitions.length,

    stateCounts:
      counts,

    hasTakeoff:
      counts.TAKEOFF > 0,

    hasFlight:
      counts.FLIGHT > 0,

    hasLanding:
      counts.LANDING > 0
  };
}

function buildFlags({
  states,
  transitions
}) {
  const flags = [];

  const summary =
    buildSummary({
      states,
      transitions
    });

  if (!summary.hasTakeoff) {
    flags.push(
      "takeoff_not_detected"
    );
  }

  if (!summary.hasFlight) {
    flags.push(
      "flight_not_detected"
    );
  }

  if (!summary.hasLanding) {
    flags.push(
      "landing_not_detected"
    );
  }

  return flags;
}

function safe(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}