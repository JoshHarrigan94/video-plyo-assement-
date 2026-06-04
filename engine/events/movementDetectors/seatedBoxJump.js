import {
  makeEvent,
  nearestAudioImpact,
  round
} from "./utils.js";

export function detectSeatedBoxJumpEvents({
  analysis,
  audioImpacts,
  fps
}) {
  const forceBout =
    analysis.signals?.forceTimeProxy?.selectedJumpBout;

  if (forceBout) {
    const takeoff = makeEvent({
      id: "takeoff_1",
      type: "takeoff_candidate",
      frameIndex: forceBout.takeoffFrame,
      timeSec: forceBout.takeoffTimeSec,
      fps,
      confidence: forceBout.confidence,
      source: "force_time_proxy_selected_bout",
      flags: [
        "force_time_proxy_selected",
        ...forceBout.flags
      ]
    });

    const landing = makeEvent({
      id: "landing_1",
      type: "landing_candidate",
      frameIndex: forceBout.landingFrame,
      timeSec: forceBout.landingTimeSec,
      fps,
      confidence: forceBout.confidence,
      source: "force_time_proxy_selected_bout",
      flags: [
        "force_time_proxy_selected",
        ...forceBout.flags
      ]
    });

    const flightWindow = buildFlightWindow(
      takeoff,
      landing
    );

    return {
      detector: "seated_box_jump_force_time_proxy_v0_3",

      candidates: [
        takeoff,
        landing,
        ...(flightWindow ? [flightWindow] : [])
      ],

      final: [
        takeoff,
        landing,
        ...(flightWindow ? [flightWindow] : [])
      ],

      takeOffs: [takeoff],
      landings: [landing],

      contacts: [],

      phases: [
        {
          id: "force_time_selected_bout",
          label: "Dominant jump bout",
          startTimeSec: forceBout.unweightingTimeSec,
          endTimeSec: forceBout.landingTimeSec,
          durationSec: forceBout.flightDurationSec,
          flags: forceBout.flags
        }
      ],

      flags: [
        "seated_box_jump_force_time_proxy_v0_3",
        "dominant_bout_selected",
        "contacts_suppressed_for_box_jump"
      ]
    };
  }

  const phase = analysis.signals?.phase;
  const frames = phase?.frames || [];

  if (!frames.length) {
    return emptyResult("no_phase_signals_available");
  }

  const takeoff = findBiomechanicalTakeoff({
    frames,
    fps
  });

  const landing = takeoff
    ? findBiomechanicalLanding({
        frames,
        takeoff,
        audioImpacts,
        fps
      })
    : null;

  const flightWindow =
    takeoff && landing
      ? buildFlightWindow(takeoff, landing)
      : null;

  return {
    detector: "seated_box_jump_biomechanical_v0_2",

    candidates: [
      ...(takeoff ? [takeoff] : []),
      ...(landing ? [landing] : []),
      ...(flightWindow ? [flightWindow] : [])
    ],

    final: [
      ...(takeoff ? [takeoff] : []),
      ...(landing ? [landing] : []),
      ...(flightWindow ? [flightWindow] : [])
    ],

    takeOffs: takeoff ? [takeoff] : [],
    landings: landing ? [landing] : [],
    contacts: [],

    phases: buildPhases({
      frames,
      takeoff,
      landing
    }),

    flags: buildDetectorFlags({
      takeoff,
      landing,
      flightWindow,
      phaseFlags: phase?.flags || []
    })
  };
}

function findBiomechanicalTakeoff({ frames, fps }) {
  const validCandidates = [];

  /*
    We ignore the first 10% of the clip as likely setup/noise.
    This avoids early seated rocking being treated as take-off.
  */

  const startIndex = Math.max(1, Math.floor(frames.length * 0.1));
  const endIndex = Math.max(startIndex + 1, frames.length - 2);

  for (let i = startIndex; i < endIndex; i++) {
    const previous = frames[i - 1];
    const current = frames[i];
    const next = frames[i + 1];

    if (!isUsablePhaseFrame(current)) continue;

    const isTripleExtensionPeak =
      current.tripleExtensionScore >= 0.55 &&
      current.tripleExtensionScore >= safeNumber(previous.tripleExtensionScore) &&
      current.tripleExtensionScore >= safeNumber(next.tripleExtensionScore);

    const hasUnloading =
      current.unloadingScore >= 0.5;

    const hasUpwardCom =
      current.upwardComVelocity >= 0.008;

    const comMovingUp =
      Number.isFinite(current.comY) &&
      Number.isFinite(next.comY) &&
      next.comY < current.comY;

    const valid =
      isTripleExtensionPeak &&
      hasUnloading &&
      hasUpwardCom &&
      comMovingUp;

    if (!valid) continue;

    const score = weightedScore([
      { value: current.tripleExtensionScore, weight: 0.38 },
      { value: current.unloadingScore, weight: 0.32 },
      { value: normalisePositive(current.upwardComVelocity, 0.025), weight: 0.2 },
      { value: comMovingUp ? 1 : 0, weight: 0.1 }
    ]);

    validCandidates.push({
      frameIndex: current.frameIndex,
      score,
      frame: current
    });
  }

  if (!validCandidates.length) {
    return null;
  }

  validCandidates.sort((a, b) => b.score - a.score);

  const best = validCandidates[0];

  const event = makeEvent({
    id: "takeoff_1",
    type: "takeoff_candidate",
    frameIndex: best.frameIndex,
    timeSec: best.frame.timeSec,
    fps,
    confidence: round(clamp(0.48 + best.score * 0.42, 0.48, 0.9), 2),
    source: "seated_box_jump_biomechanical_detector",
    flags: [
      "triple_extension_validated",
      "unloading_validated",
      "upward_com_validated",
      "rocking_motion_filtered"
    ]
  });

  event.phaseEvidence = {
    tripleExtensionScore: best.frame.tripleExtensionScore,
    unloadingScore: best.frame.unloadingScore,
    upwardComVelocity: best.frame.upwardComVelocity,
    hipExtensionVelocity: best.frame.hipExtensionVelocity,
    kneeExtensionVelocity: best.frame.kneeExtensionVelocity,
    ankleExtensionVelocity: best.frame.ankleExtensionVelocity,
    comY: best.frame.comY
  };

  return event;
}

function findBiomechanicalLanding({
  frames,
  takeoff,
  audioImpacts,
  fps
}) {
  /*
    Minimum flight protects us from treating immediate post-takeoff noise
    as landing. For a box jump, true flight should not happen in 1–2 frames.
  */

  const minFlightSec = 0.18;
  const maxFlightSec = 1.4;

  const startFrame = takeoff.frameIndex + Math.max(2, Math.round(minFlightSec * fps));
  const endFrame = Math.min(
    frames.length - 1,
    takeoff.frameIndex + Math.round(maxFlightSec * fps)
  );

  let best = null;

  for (let i = startFrame; i < endFrame; i++) {
    const previous = frames[i - 1];
    const current = frames[i];
    const next = frames[i + 1];

    if (!current) continue;

    const downwardCom =
      Number.isFinite(current.upwardComVelocity) &&
      current.upwardComVelocity < -0.004;

    const comStopsFalling =
      previous &&
      next &&
      Number.isFinite(previous.comY) &&
      Number.isFinite(current.comY) &&
      Number.isFinite(next.comY) &&
      current.comY >= previous.comY &&
      next.comY <= current.comY;

    const ankleMotion =
      Math.abs(safeNumber(current.ankleVelocity)) >= 0.004;

    const likelyLanding =
      downwardCom || comStopsFalling || ankleMotion;

    if (!likelyLanding) continue;

    const score = weightedScore([
      { value: downwardCom ? 0.7 : 0, weight: 0.35 },
      { value: comStopsFalling ? 0.85 : 0, weight: 0.35 },
      { value: ankleMotion ? 0.55 : 0, weight: 0.15 },
      { value: normalisePositive(Math.abs(safeNumber(current.ankleVelocity)), 0.018), weight: 0.15 }
    ]);

    if (!best || score > best.score) {
      best = {
        frameIndex: current.frameIndex,
        score,
        frame: current
      };
    }
  }

  let event = best
  ? makeEvent({
      id: "landing_1",
      type: "landing_candidate",
      frameIndex: best.frameIndex,
      timeSec: best.frame.timeSec,
      fps,
      confidence: round(
        clamp(
          0.42 + best.score * 0.38,
          0.42,
          0.82
        ),
        2
      ),
      source: "seated_box_jump_biomechanical_detector",
      flags: ["post_takeoff_landing_pattern"]
    })
  : null;

  const audio = takeoff
    ? findPostTakeoffAudioImpact({
        takeoffTimeSec: takeoff.timeSec,
        audioImpacts,
        minFlightSec,
        maxFlightSec
      })
    : null;

  if (!event && audio) {
    event = {
      ...makeEvent({
        id: "landing_1",
        type: "landing_candidate",
        frameIndex: Math.round(audio.timeSec * fps),
        fps,
        confidence: 0.62,
        source: "seated_box_jump_audio_landing_fallback",
        flags: ["audio_detected_landing_fallback"]
      }),
      timeSec: audio.timeSec,
      audioValidation: {
        status: "matched",
        nearestImpact: audio,
        deltaSec: 0,
        toleranceSec: 0.18
      }
    };

    return event;
  }

  if (!event) {
    return null;
  }

  const nearestAudio = nearestAudioImpact(event.timeSec, audioImpacts);

  if (nearestAudio) {
    const deltaSec = Math.abs(nearestAudio.timeSec - event.timeSec);

    if (deltaSec <= 0.18) {
      event.confidence = round(Math.min(0.95, event.confidence + 0.18), 2);
      event.flags.push("audio_validated");

      event.audioValidation = {
        status: "matched",
        nearestImpact: nearestAudio,
        deltaSec: round(deltaSec, 4),
        toleranceSec: 0.18
      };
    } else {
      event.flags.push("audio_not_aligned");

      event.audioValidation = {
        status: "not_matched",
        nearestImpact: nearestAudio,
        deltaSec: round(deltaSec, 4),
        toleranceSec: 0.18
      };
    }
  }

  if (best) {
    event.phaseEvidence = {
      upwardComVelocity: best.frame.upwardComVelocity,
      ankleVelocity: best.frame.ankleVelocity,
      comY: best.frame.comY
    };
  }

  return event;
}

function buildFlightWindow(takeoff, landing) {
  const durationSec = landing.timeSec - takeoff.timeSec;

  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return null;
  }

  return {
    id: "flight_1",
    type: "flight_window_candidate",
    startFrame: takeoff.frameIndex,
    endFrame: landing.frameIndex,
    startTimeSec: takeoff.timeSec,
    endTimeSec: landing.timeSec,
    durationSec: round(durationSec, 4),
    confidence: Math.min(takeoff.confidence, landing.confidence),
    source: "seated_box_jump_takeoff_to_landing",
    flags: [
      "candidate_flight_window",
      "box_jump_height_requires_landing_height_reference"
    ]
  };
}

function buildPhases({ frames, takeoff, landing }) {
  const phases = [];

  if (takeoff) {
    phases.push({
      id: "rock_preload_phase",
      label: "Seated rock / preload",
      startTimeSec: 0,
      endTimeSec: takeoff.timeSec,
      flags: ["excluded_from_contact_count"]
    });
  }

  if (takeoff && landing) {
    phases.push({
      id: "flight_phase",
      label: "Flight",
      startTimeSec: takeoff.timeSec,
      endTimeSec: landing.timeSec,
      durationSec: round(landing.timeSec - takeoff.timeSec, 4)
    });
  }

  if (landing) {
    const finalFrame = frames[frames.length - 1];

    phases.push({
      id: "landing_stabilisation_phase",
      label: "Landing / stabilisation",
      startTimeSec: landing.timeSec,
      endTimeSec: finalFrame?.timeSec || null
    });
  }

  return phases;
}

function buildDetectorFlags({
  takeoff,
  landing,
  flightWindow,
  phaseFlags
}) {
  const flags = [
    "seated_box_jump_biomechanical_detector_v0_2",
    "single_takeoff_single_landing_expected",
    "rocking_motion_filtered",
    "contacts_suppressed_for_box_jump"
  ];

  if (!takeoff) flags.push("no_biomechanical_takeoff_detected");
  if (!landing) flags.push("no_landing_detected");
  if (!flightWindow) flags.push("no_flight_window_detected");

  if (phaseFlags.length) {
    flags.push(...phaseFlags.map(flag => `phase_${flag}`));
  }

  return flags;
}

function findPostTakeoffAudioImpact({
  takeoffTimeSec,
  audioImpacts,
  minFlightSec,
  maxFlightSec
}) {
  if (!audioImpacts?.length) return null;

  return audioImpacts.find(impact => {
    const dt = impact.timeSec - takeoffTimeSec;
    return dt >= minFlightSec && dt <= maxFlightSec;
  }) || null;
}

function emptyResult(flag) {
  return {
    detector: "seated_box_jump_biomechanical_v0_2",
    candidates: [],
    final: [],
    takeOffs: [],
    landings: [],
    contacts: [],
    phases: [],
    flags: [
      "seated_box_jump_biomechanical_detector_v0_2",
      flag
    ]
  };
}

function isUsablePhaseFrame(frame) {
  return (
    frame &&
    Number.isFinite(frame.tripleExtensionScore) &&
    Number.isFinite(frame.unloadingScore) &&
    Number.isFinite(frame.upwardComVelocity)
  );
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

function normalisePositive(value, strongValue) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return 0;
  }

  return clamp(number / strongValue, 0, 1);
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}