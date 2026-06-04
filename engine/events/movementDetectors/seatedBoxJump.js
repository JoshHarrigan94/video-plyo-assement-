import {
  buildMovementSeries,
  makeEvent,
  nearestAudioImpact,
  percentile,
  round
} from "./utils.js";

export function detectSeatedBoxJumpEvents({
  joints,
  velocities,
  angles,
  audioImpacts,
  fps
}) {
  const series = buildMovementSeries({
    joints,
    velocities,
    angles
  });

  const upwardThreshold = percentile(series.map(p => p.upwardDrive), 92);
  const downwardThreshold = percentile(series.map(p => p.downwardMotion), 88);
  const footThreshold = percentile(series.map(p => p.footMotion), 88);

  const takeoff = findPrimaryTakeoff(series, upwardThreshold, fps);
  const landing = takeoff
    ? findFirstLandingAfterTakeoff({
        series,
        takeoff,
        downwardThreshold,
        footThreshold,
        audioImpacts,
        fps
      })
    : null;

  const takeOffs = takeoff ? [takeoff] : [];
  const landings = landing ? [landing] : [];

  const contacts =
    takeoff && landing
      ? []
      : [];

  const flight =
    takeoff && landing
      ? {
          id: "flight_1",
          type: "flight_window_candidate",
          startFrame: takeoff.frameIndex,
          endFrame: landing.frameIndex,
          startTimeSec: takeoff.timeSec,
          endTimeSec: landing.timeSec,
          durationSec: round(landing.timeSec - takeoff.timeSec, 4),
          confidence: Math.min(takeoff.confidence, landing.confidence),
          source: "seated_box_jump_takeoff_to_landing",
          flags: ["candidate_flight_window"]
        }
      : null;

  const final = [
    ...takeOffs,
    ...landings,
    ...(flight ? [flight] : [])
  ];

  return {
    detector: "seated_box_jump",
    candidates: final,
    final,
    takeOffs,
    landings,
    contacts,
    phases: buildPhases({ takeoff, landing }),
    flags: buildFlags({ takeoff, landing })
  };
}

function findPrimaryTakeoff(series, threshold, fps) {
  let best = null;

  for (let i = 2; i < series.length - 2; i++) {
    const point = series[i];

    const isStrongUpward =
      point.upwardDrive >= threshold &&
      point.upwardDrive > series[i - 1].upwardDrive &&
      point.upwardDrive > series[i + 1].upwardDrive;

    if (!isStrongUpward) continue;

    if (!best || point.upwardDrive > best.score) {
      best = {
        frameIndex: i,
        score: point.upwardDrive
      };
    }
  }

  if (!best) return null;

  return makeEvent({
    id: "takeoff_1",
    type: "takeoff_candidate",
    frameIndex: best.frameIndex,
    fps,
    confidence: 0.62,
    source: "seated_box_jump_detector",
    flags: ["primary_upward_drive_peak", "rocking_motion_filtered"]
  });
}

function findFirstLandingAfterTakeoff({
  series,
  takeoff,
  downwardThreshold,
  footThreshold,
  audioImpacts,
  fps
}) {
  const minFlightFrames = Math.max(2, Math.round(fps * 0.12));
  const start = takeoff.frameIndex + minFlightFrames;

  let best = null;

  for (let i = start; i < series.length - 1; i++) {
    const point = series[i];

    const downwardHit = point.downwardMotion >= downwardThreshold;
    const footHit = point.footMotion >= footThreshold;

    if (!downwardHit && !footHit) continue;

    best = {
      frameIndex: i,
      score: Math.max(point.downwardMotion || 0, point.footMotion || 0)
    };

    break;
  }

  if (!best) {
    const audio = audioImpacts.find(
      impact => impact.timeSec > takeoff.timeSec + 0.12
    );

    if (!audio) return null;

    const frameIndex = Math.round(audio.timeSec * fps);

    return {
      ...makeEvent({
        id: "landing_1",
        type: "landing_candidate",
        frameIndex,
        fps,
        confidence: 0.58,
        source: "seated_box_jump_audio_fallback",
        flags: ["audio_detected_landing_fallback"]
      }),
      audioValidation: {
        status: "matched",
        nearestImpact: audio,
        deltaSec: 0
      }
    };
  }

  const landing = makeEvent({
    id: "landing_1",
    type: "landing_candidate",
    frameIndex: best.frameIndex,
    fps,
    confidence: 0.58,
    source: "seated_box_jump_detector",
    flags: ["first_post_takeoff_downward_or_foot_spike"]
  });

  const audio = nearestAudioImpact(landing.timeSec, audioImpacts);

  if (audio && Math.abs(audio.timeSec - landing.timeSec) <= 0.16) {
    landing.confidence = round(Math.min(0.95, landing.confidence + 0.2), 2);
    landing.audioValidation = {
      status: "matched",
      nearestImpact: audio,
      deltaSec: round(Math.abs(audio.timeSec - landing.timeSec), 4)
    };
    landing.flags.push("audio_validated");
  }

  return landing;
}

function buildPhases({ takeoff, landing }) {
  const phases = [];

  if (takeoff) {
    phases.push({
      id: "prep_phase",
      label: "Seated rock / preparation",
      startTimeSec: 0,
      endTimeSec: takeoff.timeSec,
      flags: ["ignored_for_contact_count"]
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
    phases.push({
      id: "stabilisation_phase",
      label: "Landing / stabilisation",
      startTimeSec: landing.timeSec,
      endTimeSec: null
    });
  }

  return phases;
}

function buildFlags({ takeoff, landing }) {
  const flags = [
    "seated_box_jump_detector_v0_1",
    "single_takeoff_single_landing_expected",
    "prep_rocking_filtered"
  ];

  if (!takeoff) flags.push("no_primary_takeoff_detected");
  if (!landing) flags.push("no_landing_detected");

  return flags;
}
