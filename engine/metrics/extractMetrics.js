export async function extractMetrics(analysis) {
  const events = analysis.events?.final || [];
  const fps = analysis.video?.fps || 30;

  const metrics = {
    contactCount: buildMetric({
      id: "contact_count",
      label: "Contact Count",
      value: countEvents(events, "contact"),
      unit: "contacts",
      source: "event_detection",
      confidence: null,
      flags: []
    }),

    eventCandidateCount: buildMetric({
      id: "event_candidate_count",
      label: "Event Candidate Count",
      value: analysis.events?.candidates?.length || 0,
      unit: "events",
      source: "pose_signal",
      confidence: null,
      flags: ["placeholder_event_logic"]
    }),

    estimatedFrameDurationMs: buildMetric({
      id: "estimated_frame_duration_ms",
      label: "Estimated Frame Duration",
      value: fps ? 1000 / fps : null,
      unit: "ms",
      source: "video_metadata",
      confidence: fps ? 0.5 : 0,
      flags: ["fps_currently_estimated"]
    })
  };

  const flightWindows = estimateFlightWindows(events);
  const contactWindows = estimateContactWindows(events);

  metrics.flightTime = buildMetric({
    id: "flight_time",
    label: "Flight Time",
    value: averageDuration(flightWindows),
    unit: "s",
    source: "event_detection",
    confidence: null,
    flags: flightWindows.length ? [] : ["insufficient_events"]
  });

  metrics.groundContactTime = buildMetric({
    id: "ground_contact_time",
    label: "Ground Contact Time",
    value: averageDuration(contactWindows),
    unit: "s",
    source: "event_detection",
    confidence: null,
    flags: contactWindows.length ? [] : ["insufficient_events"]
  });

  metrics.jumpHeight = buildMetric({
    id: "jump_height",
    label: "Jump Height",
    value: estimateJumpHeightFromFlightTime(metrics.flightTime.value),
    unit: "m",
    source: "flight_time",
    confidence: null,
    flags: metrics.flightTime.value
      ? ["derived_from_flight_time"]
      : ["insufficient_flight_time"]
  });

  metrics.rsi = buildMetric({
    id: "reactive_strength_index",
    label: "Reactive Strength Index",
    value: estimateRSI(
      metrics.jumpHeight.value,
      metrics.groundContactTime.value
    ),
    unit: "m/s",
    source: "jump_height_and_ground_contact_time",
    confidence: null,
    flags:
      metrics.jumpHeight.value && metrics.groundContactTime.value
        ? ["derived_metric"]
        : ["insufficient_inputs"]
  });

  analysis.metrics = {
    status: "complete",
    registryVersion: "0.1",
    values: metrics,
    flags: [
      "metrics_use_placeholder_event_detection",
      "metrics_not_validation_ready"
    ]
  };

  analysis.logs.push({
    time: new Date().toISOString(),
    level: "info",
    module: "metrics",
    message: "Metric extraction completed."
  });

  return analysis;
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

function countEvents(events, type) {
  return events.filter(event => event.type === type).length;
}

function estimateFlightWindows(events) {
  /*
    Future:
    landing -> takeoff / takeoff -> landing windows.

    Current placeholder returns no windows because final event
    classification is not mature yet.
  */

  return [];
}

function estimateContactWindows(events) {
  /*
    Future:
    landing timestamp to next takeoff timestamp.
  */

  return [];
}

function averageDuration(windows) {
  if (!windows.length) return null;

  const durations = windows
    .map(window => window.durationSec)
    .filter(Number.isFinite);

  if (!durations.length) return null;

  return durations.reduce((sum, value) => sum + value, 0) / durations.length;
}

function estimateJumpHeightFromFlightTime(flightTimeSec) {
  const t = Number(flightTimeSec);

  if (!Number.isFinite(t) || t <= 0) return null;

  /*
    h = g * t² / 8

    Standard flight-time jump height estimate.
    This is only valid when flight time is accurately measured.
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

function cleanNumber(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function round(value, decimals = 3) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
