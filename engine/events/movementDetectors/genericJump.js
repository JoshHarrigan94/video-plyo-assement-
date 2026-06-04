import {
  average,
  buildContactWindows,
  buildMovementSeries,
  makeEvent,
  nearestAudioImpact,
  percentile,
  round
} from "./utils.js";

export function detectGenericJumpEvents({
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

  const upwardThreshold = percentile(series.map(p => p.upwardDrive), 80);
  const downwardThreshold = percentile(series.map(p => p.downwardMotion), 80);
  const footThreshold = percentile(series.map(p => p.footMotion), 85);

  const candidates = [];

  for (let i = 1; i < series.length - 1; i++) {
    const previous = series[i - 1];
    const current = series[i];
    const next = series[i + 1];

    if (!isFinite(current.hipY)) continue;

    const upwardPeak =
      current.upwardDrive >= upwardThreshold &&
      current.upwardDrive > previous.upwardDrive &&
      current.upwardDrive > next.upwardDrive;

    const downwardPeak =
      current.downwardMotion >= downwardThreshold &&
      current.downwardMotion > previous.downwardMotion &&
      current.downwardMotion > next.downwardMotion;

    const footSpike =
      current.footMotion >= footThreshold &&
      current.footMotion > previous.footMotion &&
      current.footMotion > next.footMotion;

    if (upwardPeak) {
      candidates.push(
        makeEvent({
          id: `takeoff_${candidates.length + 1}`,
          type: "takeoff_candidate",
          frameIndex: i,
          fps,
          confidence: 0.5,
          source: "generic_jump_detector",
          flags: ["upward_drive_peak"]
        })
      );
    }

    if (downwardPeak || footSpike) {
      const event = makeEvent({
        id: `landing_${candidates.length + 1}`,
        type: "landing_candidate",
        frameIndex: i,
        fps,
        confidence: 0.45,
        source: "generic_jump_detector",
        flags: downwardPeak
          ? ["downward_motion_peak"]
          : ["foot_motion_spike"]
      });

      const audio = nearestAudioImpact(event.timeSec, audioImpacts);

      if (audio && Math.abs(audio.timeSec - event.timeSec) <= 0.12) {
        event.confidence = round(event.confidence + 0.18, 2);
        event.audioValidation = {
          status: "matched",
          nearestImpact: audio,
          deltaSec: round(Math.abs(audio.timeSec - event.timeSec), 4)
        };
        event.flags.push("audio_validated");
      }

      candidates.push(event);
    }
  }

  const takeOffs = candidates.filter(e => e.type === "takeoff_candidate");
  const landings = candidates.filter(e => e.type === "landing_candidate");
  const contacts = buildContactWindows(landings, takeOffs);

  return {
    detector: "generic_jump",
    candidates,
    final: [...takeOffs, ...landings, ...contacts],
    takeOffs,
    landings,
    contacts,
    phases: [],
    flags: ["generic_jump_detector_v0_1", "candidate_based"]
  };
}