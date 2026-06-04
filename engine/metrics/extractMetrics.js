export async function extractMetrics(analysis) {
  const takeOffs = analysis.events?.takeOffs || [];
  const landings = analysis.events?.landings || [];
  const contacts = analysis.events?.contacts || [];
  const fps = analysis.video?.fps || 30;

  const flightWindows = estimateFlightWindows(takeOffs, landings);
  const contactWindows = contacts;

  const averageFlightTime = averageDuration(flightWindows);
  const averageContactTime = averageDuration(contactWindows);
  const jumpHeightM = estimateJumpHeightFromFlightTime(averageFlightTime);

  const metrics = {
    contactCount: buildMetric({
      id: "contact_count",
      label: "Contact Count",
      value: contacts.length || landings.length,
      unit: "contacts",
      source: "event_detection",
      confidence: null,
      flags: ["candidate_based"]
    }),

    takeoffCount: buildMetric({
      id: "takeoff_count",
      label: "Take-off Count",
      value: takeOffs.length,
      unit: "events",
      source: "event_detection",
      confidence: null,
      flags: ["candidate_based"]
    }),

    landingCount: buildMetric({
      id: "landing_count",
      label: "Landing Count",
      value: landings.length,
      unit: "events",
      source: "event_detection",
      confidence: null,
      flags: ["candidate_based"]
    }),

    eventCandidateCount: buildMetric({
      id: "event_candidate_count",
      label: "Event Candidate Count",
      value: analysis.events?.candidates?.length || 0,
      unit: "events",
      source: "pose_signal",
      confidence: null,
      flags: ["candidate_based"]
    }),

    estimatedFrameDurationMs: buildMetric({
      id: "estimated_frame_duration_ms",
      label: "Estimated Frame Duration",
      value: fps ? round(1000 / fps, 2) : null,
      unit: "ms",
      source: "video_metadata",
      confidence: fps ? 0.5 : 0,
      flags: ["fps_currently_estimated"]
    }),

    flightTime: buildMetric({
      id: "flight_time",
      label: "Average Flight Time",
      value: averageFlightTime,
      unit: "s",
      source: "takeoff_to_landing_candidates",
      confidence: null,
      flags: flightWindows.length
        ? ["candidate_based"]
        : ["insufficient_takeoff_landing_pairs"]
    }),

    groundContactTime: buildMetric({
      id: "ground_contact_time",
      label: "Average Ground Contact Time",
      value: averageContactTime,
      unit: "s",
      source: "landing_to_next_takeoff_candidates",
      confidence: null,
      flags: contactWindows.length
        ? ["candidate_based"]
        : ["insufficient_contact_windows"]
    }),

    jumpHeight: buildMetric({
      id: "jump_height",
      label: "Estimated Jump Height",
      value: jumpHeightM,
      unit: "m",
      source: "flight_time",
      confidence: null,
      flags: jumpHeightM
        ? ["derived_from_candidate_flight_time"]
        : ["insufficient_flight_time"]
    }),

    rsi: buildMetric({
      id: "reactive_strength_index",
      label: "Reactive Strength Index",
      value: estimateRSI(jumpHeightM, averageContactTime),
      unit: "m/s",
      source: "jump_height_and_ground_contact_time",
      confidence: null,
      flags:
        jumpHeightM && averageContactTime
          ? ["derived_from_candidate_metrics"]
          : ["insufficient_inputs"]
    })
  };

  analysis.metrics = {
    status: "complete",
    registryVersion: "0.1",
    values: metrics,
    windows: {
      flight: flightWindows,
      contact: contactWindows
    },
    flags: [
      "metrics_candidate_based",
      "not_validation_grade",
      "requires_audio_validation_and_manual_labelling"
    ]
  };

  analysis.logs.push({
    time: new Date().toISOString(),
    level: "info",
    module: "metrics",
    message: "Metric extraction completed from event candidates."
  });

  return analysis;
}

function estimateFlightWindows(takeOffs, landings) {
  const windows = [];

  for (const takeoff of takeOffs) {
    const landing = landings.find(
      item => item.frameIndex > takeoff.frameIndex
    );

    if (!landing) continue;

    const durationSec = landing.timeSec - takeoff.timeSec;

    if (!Number.isFinite(durationSec) || durationSec <= 0) continue;

    windows.push({
      id: `flight_window_${windows.length + 1}`,
      type: "flight_window_candidate",
      startFrame: takeoff.frameIndex,
      endFrame: landing.frameIndex,
      startTimeSec: takeoff.timeSec,
      endTimeSec: landing.timeSec,
      durationSec: round(durationSec, 4),
      source: "takeoff_to_next_landing",
      confidence: Math.min(takeoff.confidence, landing.confidence),
      flags: ["candidate_flight_window"]
    });
  }

  return dedupeWindows(windows);
}

function dedupeWindows(windows) {
  const seen = new Set();

  return windows.filter(window => {
    const key = `${window.startFrame}_${window.endFrame}`;

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

function averageDuration(windows) {
  if (!windows.length) return null;

  const durations = windows
    .map(window => window.durationSec)
    .filter(Number.isFinite);

  if (!durations.length) return null;

  return round(
    durations.reduce((sum, value) => sum + value, 0) / durations.length,
    4
  );
}

function estimateJumpHeightFromFlightTime(flightTimeSec) {
  const t = Number(flightTimeSec);

  if (!Number.isFinite(t) || t <= 0) return null;

  /*
    h = g * t² / 8
  */

  const g = 9.80665;

  return round((g * t * t) / 8, 4);
}

function estimateRSI(jumpHeightM, groundContactTimeSec) {
  const height = Number(jumpHeightM);
  const contact = Number(groundContactTimeSec);

  if (
    !Number.isFinite(height) ||
    !Number.isFinite(contact) ||
    contact <= 0
  ) {
    return null;
  }

  return round(height / contact, 3);
}

function buildMetric({
  id,
  label,
  value,
  unit,
  source,
  confidence,
  flags
}) {
  return {
    id,
    label,
    value: cleanNumber(value),
    unit,
    source,
    confidence,
    errorEstimate: null,
    flags: flags || []
  };
}

function cleanNumber(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function round(value, decimals = 3) {
  const number = Number(value);

  if (!Number.isFinite(number)) return null;

  const factor = Math.pow(10, decimals);
  return Math.round(number * factor) / factor;
}
