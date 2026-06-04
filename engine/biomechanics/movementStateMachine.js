/*
  movementStateMachine.js

  Purpose:
  Convert biomechanical signals into meaningful movement states.

  Design:
  - Frame evidence identifies what each frame looks like.
  - Sequence memory prevents isolated peaks from creating false events.
  - This supports both single jumps and future repeated contacts.
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
      bouts: [],
      summary: {},
      flags: ["no_phase_frames"]
    };
  }

  const context = {
    currentState: STATES.SETUP,
    hasTakenOff: false,
    hasLanded: false,
    activeBout: null,
    bouts: []
  };

  const states = [];

  for (let i = 0; i < phaseFrames.length; i++) {
    const frame = phaseFrames[i];
    const previous = phaseFrames[i - 1] || null;
    const next = phaseFrames[i + 1] || null;

    const evidence = buildFrameEvidence({
      frame,
      previous,
      next
    });

    const nextState = determineState({
      evidence,
      context
    });

    updateContext({
      context,
      frame,
      state: nextState,
      evidence
    });

    states.push({
      frameIndex: frame.frameIndex,
      timeSec: frame.timeSec,
      state: nextState,

      tripleExtensionScore: frame.tripleExtensionScore,
      unloadingScore: frame.unloadingScore,
      upwardComVelocity: frame.upwardComVelocity,
      comY: frame.comY,

      evidence
    });

    context.currentState = nextState;
  }

  closeOpenBout({
    context,
    finalFrame: phaseFrames[phaseFrames.length - 1]
  });

  const transitions = extractTransitions(states);

  return {
    states,
    transitions,
    bouts: context.bouts,

    summary: buildSummary({
      states,
      transitions,
      bouts: context.bouts
    }),

    flags: buildFlags({
      states,
      transitions,
      bouts: context.bouts
    })
  };
}

function buildFrameEvidence({ frame, previous, next }) {
  const triple = safe(frame.tripleExtensionScore);
  const unloading = safe(frame.unloadingScore);
  const upward = safe(frame.upwardComVelocity);

  const previousComY = previous ? safeNullable(previous.comY) : null;
  const currentComY = safeNullable(frame.comY);
  const nextComY = next ? safeNullable(next.comY) : null;

  const comMovingUp =
    Number.isFinite(currentComY) &&
    Number.isFinite(nextComY) &&
    nextComY < currentComY;

  const comMovingDown =
    Number.isFinite(currentComY) &&
    Number.isFinite(nextComY) &&
    nextComY > currentComY;

  const comLowPoint =
    Number.isFinite(previousComY) &&
    Number.isFinite(currentComY) &&
    Number.isFinite(nextComY) &&
    currentComY >= previousComY &&
    currentComY >= nextComY;

  const comHighPoint =
    Number.isFinite(previousComY) &&
    Number.isFinite(currentComY) &&
    Number.isFinite(nextComY) &&
    currentComY <= previousComY &&
    currentComY <= nextComY;

  const takeoffEvidence =
    triple >= 0.7 &&
    unloading >= 0.7 &&
    upward >= 0.015;

  const strongTakeoffEvidence =
    triple >= 0.8 &&
    unloading >= 0.8 &&
    upward >= 0.02;

  const flightFrameEvidence =
    unloading >= 0.55 &&
    (comMovingUp || comMovingDown || comHighPoint);

  const landingEvidence =
    upward <= -0.006 ||
    comLowPoint;

  const propulsionEvidence =
    triple >= 0.55 &&
    upward > 0.004;

  const preloadEvidence =
    triple >= 0.2 ||
    unloading >= 0.2;

  const stableEvidence =
    Math.abs(upward) < 0.003 &&
    triple < 0.25 &&
    unloading < 0.25;

  return {
    triple,
    unloading,
    upward,

    comMovingUp,
    comMovingDown,
    comLowPoint,
    comHighPoint,

    takeoffEvidence,
    strongTakeoffEvidence,
    flightFrameEvidence,
    landingEvidence,
    propulsionEvidence,
    preloadEvidence,
    stableEvidence
  };
}

function determineState({ evidence, context }) {
  const current = context.currentState;

  /*
    Repeated-contact support:
    After a landing/stabilisation, the state machine can re-enter
    preload/propulsion/takeoff again if evidence appears.
  */

  if (evidence.strongTakeoffEvidence || evidence.takeoffEvidence) {
    return STATES.TAKEOFF;
  }

  /*
    Sequence-based flight:
    Once takeoff has occurred, anything before landing is considered flight
    unless landing evidence is strong.
  */

  if (context.hasTakenOff && !context.hasLanded) {
    if (evidence.landingEvidence) {
      return STATES.LANDING;
    }

    if (evidence.flightFrameEvidence || current === STATES.TAKEOFF || current === STATES.FLIGHT) {
      return STATES.FLIGHT;
    }

    return STATES.FLIGHT;
  }

  if (evidence.landingEvidence && context.hasTakenOff) {
    return STATES.LANDING;
  }

  if (current === STATES.LANDING && evidence.stableEvidence) {
    return STATES.STABILISATION;
  }

  if (current === STATES.STABILISATION && evidence.preloadEvidence) {
    return STATES.PRELOAD;
  }

  if (evidence.propulsionEvidence) {
    return STATES.PROPULSION;
  }

  if (evidence.preloadEvidence) {
    return STATES.PRELOAD;
  }

  if (current === STATES.STABILISATION) {
    return STATES.STABILISATION;
  }

  return STATES.SETUP;
}

function updateContext({ context, frame, state, evidence }) {
  if (state === STATES.TAKEOFF) {
    if (!context.activeBout) {
      context.activeBout = {
        id: `jump_bout_${context.bouts.length + 1}`,
        takeoffFrame: frame.frameIndex,
        takeoffTimeSec: frame.timeSec,
        landingFrame: null,
        landingTimeSec: null,
        flightDurationSec: null,
        flags: []
      };
    }

    context.hasTakenOff = true;
    context.hasLanded = false;
  }

  if (state === STATES.LANDING) {
    context.hasLanded = true;

    if (context.activeBout && context.activeBout.landingFrame === null) {
      context.activeBout.landingFrame = frame.frameIndex;
      context.activeBout.landingTimeSec = frame.timeSec;
      context.activeBout.flightDurationSec = round(
        frame.timeSec - context.activeBout.takeoffTimeSec,
        4
      );

      context.bouts.push(context.activeBout);
      context.activeBout = null;
    }
  }

  if (state === STATES.STABILISATION) {
    context.hasTakenOff = false;
    context.hasLanded = false;
  }

  /*
    Future repeated contacts:
    if stabilisation is skipped and a new preload/propulsion emerges,
    the detector can still start a new bout after landing.
  */

  if (
    context.hasLanded &&
    (state === STATES.PRELOAD || state === STATES.PROPULSION)
  ) {
    context.hasTakenOff = false;
    context.hasLanded = false;
  }
}

function closeOpenBout({ context, finalFrame }) {
  if (!context.activeBout) return;

  context.activeBout.flags.push("bout_open_no_landing_detected");
  context.activeBout.endFrame = finalFrame?.frameIndex ?? null;
  context.activeBout.endTimeSec = finalFrame?.timeSec ?? null;

  context.bouts.push(context.activeBout);
  context.activeBout = null;
}

function extractTransitions(states) {
  const transitions = [];

  for (let i = 1; i < states.length; i++) {
    const previous = states[i - 1];
    const current = states[i];

    if (previous.state !== current.state) {
      transitions.push({
        from: previous.state,
        to: current.state,
        frameIndex: current.frameIndex,
        timeSec: current.timeSec
      });
    }
  }

  return transitions;
}

function buildSummary({ states, transitions, bouts }) {
  const counts = {};

  for (const state of states) {
    counts[state.state] = (counts[state.state] || 0) + 1;
  }

  const completedBouts = bouts.filter(bout =>
    Number.isFinite(bout.flightDurationSec)
  );

  return {
    totalFrames: states.length,
    transitions: transitions.length,
    stateCounts: counts,

    jumpBoutCount: bouts.length,
    completedJumpBoutCount: completedBouts.length,

    hasTakeoff: (counts.TAKEOFF || 0) > 0,
    hasFlight: (counts.FLIGHT || 0) > 0,
    hasLanding: (counts.LANDING || 0) > 0,

    averageFlightDurationSec:
      completedBouts.length
        ? round(
            completedBouts.reduce(
              (sum, bout) => sum + bout.flightDurationSec,
              0
            ) / completedBouts.length,
            4
          )
        : null
  };
}

function buildFlags({ states, transitions, bouts }) {
  const flags = [];

  const summary = buildSummary({
    states,
    transitions,
    bouts
  });

  if (!summary.hasTakeoff) flags.push("takeoff_not_detected");
  if (!summary.hasFlight) flags.push("flight_not_detected");
  if (!summary.hasLanding) flags.push("landing_not_detected");

  if (!summary.completedJumpBoutCount) {
    flags.push("no_completed_jump_bout_detected");
  }

  const openBouts = bouts.filter(bout =>
    bout.flags?.includes("bout_open_no_landing_detected")
  );

  if (openBouts.length) {
    flags.push("open_jump_bout_without_landing");
  }

  return flags;
}

function safe(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function safeNullable(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, decimals = 3) {
  const number = Number(value);

  if (!Number.isFinite(number)) return null;

  const factor = Math.pow(10, decimals);
  return Math.round(number * factor) / factor;
}