export async function detectMovementEvents(analysis) {
  const joints = analysis.signals?.joints || {};
  const velocities = analysis.signals?.velocities || {};
  const angles = analysis.signals?.angles || {};
  const audioImpacts = analysis.audio?.impacts || [];

  const hipY = joints.hipY || [];
  const ankleY = joints.ankleY || [];
  const hipVelocity = velocities.hipVelocity || [];
  const ankleVelocity = velocities.ankleVelocity || [];

  if (!hipY.length || !ankleY.length) {
    analysis.events.status = "skipped";
    analysis.events.flags.push("event_detection_skipped_no_signals");
    return analysis;
  }

  analysis.events.status = "running";

  const movement = buildMovementSeries({
    hipY,
    ankleY,
    hipVelocity,
    ankleVelocity,
    angles
  });

  const candidates = detectCandidates(movement, analysis.video?.fps || 30);
  const classified = classifyEvents(candidates, movement);
  const validated = validateWithAudio(classified, audioImpacts);

  analysis.events = {
    ...analysis.events,
    status: "complete",
    candidates,
    final: validated.final,
    takeOffs: validated.takeOffs,
    landings: validated.landings,
    contacts: validated.contacts,
    flags: buildEventFlags(candidates, validated, audioImpacts)
  };

  analysis.logs.push({
    time: new Date().toISOString(),
    level: "info",
    module: "events",
    message: `Event detection completed with ${validated.takeOffs.length} take-off(s), ${validated.landings.length} landing(s), ${audioImpacts.length} audio impact(s).`
  });

  return analysis;
}

function buildMovementSeries({ hipY, ankleY, hipVelocity, ankleVelocity, angles }) {
  const length = Math.max(hipY.length, ankleY.length, hipVelocity.length, ankleVelocity.length);

  const leftKnee = angles.leftKneeAngle || [];
  const rightKnee = angles.rightKneeAngle || [];

  const series = [];

  for (let i = 0; i < length; i++) {
    const hip = clean(hipY[i]);
    const ankle = clean(ankleY[i]);
    const hipVel = clean(hipVelocity[i]);
    const ankleVel = clean(ankleVelocity[i]);

    series.push({
      frameIndex: i,
      hipY: hip,
      ankleY: ankle,
      hipVelocity: hipVel,
      ankleVelocity: ankleVel,
      kneeAngle: average([leftKnee[i], rightKnee[i]]),
      upwardDrive: Number.isFinite(hipVel) ? -hipVel : null,
      downwardMotion: Number.isFinite(hipVel) ? hipVel : null,
      footMotion: Number.isFinite(ankleVel) ? Math.abs(ankleVel) : null
    });
  }

  return series;
}

function detectCandidates(series, fps) {
  const candidates = [];

  const upwardThreshold = percentile(series.map(p => p.upwardDrive), 75);
  const downwardThreshold = percentile(series.map(p => p.downwardMotion), 75);
  const footMotionThreshold = percentile(series.map(p => p.footMotion), 75);

  for (let i = 1; i < series.length - 1; i++) {
    const prev = series[i - 1];
    const curr = series[i];
    const next = series[i + 1];

    if (!isUsable(curr)) continue;

    const localUpwardPeak =
      Number.isFinite(curr.upwardDrive) &&
      curr.upwardDrive > clean(prev.upwardDrive, -Infinity) &&
      curr.upwardDrive > clean(next.upwardDrive, -Infinity) &&
      curr.upwardDrive >= upwardThreshold;

    const localDownwardPeak =
      Number.isFinite(curr.downwardMotion) &&
      curr.downwardMotion > clean(prev.downwardMotion, -Infinity) &&
      curr.downwardMotion > clean(next.downwardMotion, -Infinity) &&
      curr.downwardMotion >= downwardThreshold;

    const footMotionSpike =
      Number.isFinite(curr.footMotion) &&
      curr.footMotion >= footMotionThreshold &&
      curr.footMotion > clean(prev.footMotion, -Infinity) &&
      curr.footMotion > clean(next.footMotion, -Infinity);

    if (localUpwardPeak) {
      candidates.push(makeCandidate({
        index: candidates.length,
        frameIndex: i,
        fps,
        type: "upward_drive_peak",
        confidence: 0.45,
        flags: ["pose_velocity_based"]
      }));
    }

    if (localDownwardPeak) {
      candidates.push(makeCandidate({
        index: candidates.length,
        frameIndex: i,
        fps,
        type: "downward_motion_peak",
        confidence: 0.4,
        flags: ["pose_velocity_based"]
      }));
    }

    if (footMotionSpike) {
      candidates.push(makeCandidate({
        index: candidates.length,
        frameIndex: i,
        fps,
        type: "foot_motion_spike",
        confidence: 0.38,
        flags: ["ankle_motion_based"]
      }));
    }
  }

  return mergeNearbyCandidates(candidates, fps);
}

function classifyEvents(candidates) {
  const takeOffs = [];
  const landings = [];
  const final = [];

  for (const candidate of candidates) {
    if (candidate.type === "upward_drive_peak") {
      const event = {
        ...candidate,
        type: "takeoff_candidate",
        source: "pose_signal",
        confidence: round(candidate.confidence + 0.1, 2),
        flags: [...candidate.flags, "requires_validation"]
      };

      takeOffs.push(event);
      final.push(event);
      continue;
    }

    if (
      candidate.type === "downward_motion_peak" ||
      candidate.type === "foot_motion_spike"
    ) {
      const event = {
        ...candidate,
        type: "landing_candidate",
        source: "pose_signal",
        confidence: round(candidate.confidence + 0.08, 2),
        flags: [...candidate.flags, "requires_audio_or_visual_validation"]
      };

      landings.push(event);
      final.push(event);
      continue;
    }

    final.push(candidate);
  }

  return {
    final,
    takeOffs,
    landings,
    contacts: buildContactWindows(landings, takeOffs)
  };
}

function validateWithAudio(classified, audioImpacts) {
  const maxDeltaSec = 0.12;

  const landings = classified.landings.map(landing => {
    const nearestImpact = findNearestAudioImpact(landing.timeSec, audioImpacts);

    if (!nearestImpact) {
      return {
        ...landing,
        audioValidation: {
          status: "not_available",
          nearestImpact: null,
          deltaSec: null
        },
        flags: [...landing.flags, "no_audio_impact_available"]
      };
    }

    const deltaSec = Math.abs(nearestImpact.timeSec - landing.timeSec);
    const matched = deltaSec <= maxDeltaSec;

    return {
      ...landing,
      confidence: matched
        ? round(Math.min(0.95, landing.confidence + 0.18), 2)
        : round(Math.max(0.15, landing.confidence - 0.12), 2),

      audioValidation: {
        status: matched ? "matched" : "not_matched",
        nearestImpact,
        deltaSec: round(deltaSec, 4),
        toleranceSec: maxDeltaSec
      },

      flags: matched
        ? [...landing.flags, "audio_validated"]
        : [...landing.flags, "audio_not_aligned"]
    };
  });

  const takeOffs = classified.takeOffs;

  const contacts = buildContactWindows(landings, takeOffs);

  const final = [
    ...takeOffs,
    ...landings,
    ...contacts
  ].sort((a, b) => {
    const aTime = a.timeSec ?? a.startTimeSec ?? Infinity;
    const bTime = b.timeSec ?? b.startTimeSec ?? Infinity;
    return aTime - bTime;
  });

  return {
    takeOffs,
    landings,
    contacts,
    final
  };
}

function buildContactWindows(landings, takeOffs) {
  const contacts = [];

  for (const landing of landings) {
    const nextTakeoff = takeOffs.find(
      takeoff => takeoff.frameIndex > landing.frameIndex
    );

    if (!nextTakeoff) continue;

    contacts.push({
      id: `contact_${contacts.length + 1}`,
      type: "contact_window_candidate",
      startFrame: landing.frameIndex,
      endFrame: nextTakeoff.frameIndex,
      startTimeSec: landing.timeSec,
      endTimeSec: nextTakeoff.timeSec,
      durationSec: round(nextTakeoff.timeSec - landing.timeSec, 4),
      source: "audio_validated_landing_to_next_takeoff",
      confidence: Math.min(landing.confidence, nextTakeoff.confidence),
      flags: landing.audioValidation?.status === "matched"
        ? ["candidate_contact_window", "landing_audio_validated"]
        : ["candidate_contact_window"]
    });
  }

  return contacts;
}

function findNearestAudioImpact(timeSec, impacts) {
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

function mergeNearbyCandidates(candidates, fps) {
  if (!candidates.length) return [];

  const minFrameGap = Math.max(1, Math.round((fps || 30) * 0.08));
  const sorted = [...candidates].sort((a, b) => a.frameIndex - b.frameIndex);
  const merged = [];

  for (const candidate of sorted) {
    const previous = merged[merged.length - 1];

    if (
      previous &&
      Math.abs(candidate.frameIndex - previous.frameIndex) <= minFrameGap &&
      candidate.type === previous.type
    ) {
      if (candidate.confidence > previous.confidence) {
        merged[merged.length - 1] = candidate;
      }
      continue;
    }

    merged.push(candidate);
  }

  return merged.map((candidate, index) => ({
    ...candidate,
    id: `event_candidate_${index + 1}`
  }));
}

function makeCandidate({ index, frameIndex, fps, type, confidence, flags }) {
  return {
    id: `event_candidate_${index + 1}`,
    frameIndex,
    timeSec: frameToTime(frameIndex, fps),
    type,
    source: "pose_signal",
    confidence,
    refined: false,
    flags
  };
}

function buildEventFlags(candidates, classified, audioImpacts) {
  const flags = ["event_detection_v0_2", "events_are_candidates_not_validated_truth"];

  if (!candidates.length) flags.push("no_event_candidates_detected");
  if (!classified.takeOffs.length) flags.push("no_takeoff_candidates_detected");
  if (!classified.landings.length) flags.push("no_landing_candidates_detected");
  if (!classified.contacts.length) flags.push("no_contact_windows_detected");
  if (!audioImpacts.length) flags.push("no_audio_impacts_for_validation");

  return flags;
}

function isUsable(point) {
  return (
    Number.isFinite(point.hipY) ||
    Number.isFinite(point.ankleY) ||
    Number.isFinite(point.upwardDrive) ||
    Number.isFinite(point.downwardMotion)
  );
}

function percentile(values, p) {
  const cleanValues = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!cleanValues.length) return Infinity;
  const index = Math.floor((p / 100) * (cleanValues.length - 1));
  return cleanValues[index];
}

function average(values) {
  const cleanValues = values.map(Number).filter(Number.isFinite);
  if (!cleanValues.length) return null;
  return cleanValues.reduce((sum, value) => sum + value, 0) / cleanValues.length;
}

function frameToTime(frameIndex, fps) {
  const frameRate = Number(fps);
  if (!Number.isFinite(frameRate) || frameRate <= 0) return null;
  return round(frameIndex / frameRate, 4);
}

function clean(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value, decimals = 3) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = Math.pow(10, decimals);
  return Math.round(number * factor) / factor;
}