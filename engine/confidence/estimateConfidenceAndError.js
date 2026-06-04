export async function estimateConfidenceAndError(analysis) {
  const qualityScore = analysis.quality?.score ?? 0;
  const poseVisibility = analysis.pose?.visibility?.average;
  const cropScore = analysis.crop?.stabilityScore;
  const signalScore = analysis.signals?.quality?.score;
  const audioScore = analysis.audio?.quality?.score;

  const baseInputs = {
    qualityScore,
    poseVisibility,
    cropScore,
    signalScore,
    audioScore,
    fps: analysis.video?.fps,
    hasLandmarks: Boolean(analysis.pose?.landmarksByFrame?.length),
    hasAudioImpacts: Boolean(analysis.audio?.impacts?.length),
    eventCandidateCount: analysis.events?.candidates?.length || 0
  };

  const overall = calculateOverallConfidence(baseInputs);
  const byMetric = {};
  const errorEstimates = {};

  const metricValues = analysis.metrics?.values || {};

  for (const [key, metric] of Object.entries(metricValues)) {
    const confidence = calculateMetricConfidence(metric, baseInputs);
    const errorEstimate = estimateMetricError(metric, confidence, baseInputs);

    byMetric[key] = confidence;
    errorEstimates[key] = errorEstimate;

    metric.confidence = confidence.score;
    metric.errorEstimate = errorEstimate;
    metric.flags = [
      ...(metric.flags || []),
      ...confidence.flags
    ];
  }

  analysis.confidence = {
    status: "complete",
    overall,
    byMetric,
    errorEstimates,
    flags: buildConfidenceFlags(baseInputs, overall)
  };

  analysis.metrics.values = metricValues;

  analysis.logs.push({
    time: new Date().toISOString(),
    level: "info",
    module: "confidence",
    message: "Confidence and error estimation completed."
  });

  return analysis;
}

function calculateOverallConfidence(inputs) {
  let score = 0;
  let weight = 0;
  const flags = [];

  addWeighted(inputs.qualityScore, 0.3);
  addWeighted(normalise01(inputs.poseVisibility), 0.25);
  addWeighted(normalise100(inputs.cropScore), 0.15);
  addWeighted(normalise100(inputs.signalScore), 0.15);
  addWeighted(normalise100(inputs.audioScore), 0.05);

  if (inputs.fps >= 60) {
    addWeighted(1, 0.1);
  } else if (inputs.fps >= 30) {
    addWeighted(0.65, 0.1);
    flags.push("standard_frame_rate_limits_temporal_precision");
  } else {
    addWeighted(0.25, 0.1);
    flags.push("low_frame_rate_limits_temporal_precision");
  }

  if (!inputs.hasLandmarks) {
    flags.push("no_pose_landmarks_available");
  }

  if (!inputs.hasAudioImpacts) {
    flags.push("no_audio_impacts_available");
  }

  const finalScore = weight
    ? Math.round((score / weight) * 100)
    : 0;

  return {
    score: clamp(finalScore, 0, 100),
    level: confidenceLevel(finalScore),
    flags
  };

  function addWeighted(value, itemWeight) {
    if (!Number.isFinite(value)) return;

    const normalised =
      value > 1 ? clamp(value / 100, 0, 1) : clamp(value, 0, 1);

    score += normalised * itemWeight;
    weight += itemWeight;
  }
}

function calculateMetricConfidence(metric, inputs) {
  let score = inputs.qualityScore || 0;
  const flags = [];

  if (metric.value === null || metric.value === undefined) {
    score -= 35;
    flags.push("metric_value_missing");
  }

  if (!inputs.hasLandmarks && metric.source !== "video_metadata") {
    score -= 35;
    flags.push("metric_depends_on_missing_landmarks");
  }

  if (
    metric.source === "event_detection" ||
    metric.source === "flight_time" ||
    metric.source === "jump_height_and_ground_contact_time"
  ) {
    if (!inputs.eventCandidateCount) {
      score -= 25;
      flags.push("metric_depends_on_missing_events");
    }

    if (inputs.fps && inputs.fps < 60) {
      score -= 10;
      flags.push("temporal_resolution_limited");
    }
  }

  if (metric.flags?.includes("placeholder_event_logic")) {
    score -= 20;
    flags.push("placeholder_logic_used");
  }

  if (metric.flags?.includes("insufficient_inputs")) {
    score -= 30;
  }

  if (metric.flags?.includes("insufficient_events")) {
    score -= 30;
  }

  const cleanScore = clamp(Math.round(score), 0, 100);

  return {
    score: cleanScore,
    level: confidenceLevel(cleanScore),
    flags
  };
}

function estimateMetricError(metric, confidence, inputs) {
  const fps = Number(inputs.fps) || 30;
  const frameDurationMs = 1000 / fps;

  if (metric.value === null || metric.value === undefined) {
    return {
      type: "not_available",
      value: null,
      unit: metric.unit,
      method: "missing_metric_value",
      flags: ["cannot_estimate_error_without_metric_value"]
    };
  }

  if (
    metric.id === "estimated_frame_duration_ms"
  ) {
    return {
      type: "absolute",
      value: round(frameDurationMs * 0.1, 2),
      unit: "ms",
      method: "metadata_placeholder_error",
      flags: ["fps_is_currently_estimated"]
    };
  }

  if (
    metric.id === "flight_time" ||
    metric.id === "ground_contact_time"
  ) {
    return {
      type: "absolute",
      value: round(frameDurationMs / 1000, 4),
      unit: "s",
      method: "one_frame_timing_bound",
      flags: ["pre_ml_temporal_error_bound"]
    };
  }

  if (metric.id === "jump_height") {
    return {
      type: "derived",
      value: null,
      unit: "m",
      method: "requires_flight_time_error_propagation",
      flags: ["not_yet_implemented"]
    };
  }

  if (metric.id === "reactive_strength_index") {
    return {
      type: "derived",
      value: null,
      unit: "m/s",
      method: "requires_jump_height_and_contact_time_error_propagation",
      flags: ["not_yet_implemented"]
    };
  }

  return {
    type: "confidence_scaled",
    value: null,
    unit: metric.unit,
    method: "generic_metric_error_placeholder",
    flags: ["generic_error_model"]
  };
}

function buildConfidenceFlags(inputs, overall) {
  const flags = [];

  if (!inputs.hasLandmarks) {
    flags.push("engine_not_measurement_ready_until_pose_connected");
  }

  if (!inputs.hasAudioImpacts) {
    flags.push("audio_validation_not_available");
  }

  if (inputs.fps < 60) {
    flags.push("ml_temporal_refinement_recommended_for_low_fps_video");
  }

  if (overall.score < 50) {
    flags.push("low_overall_confidence");
  }

  return flags;
}

function normalise100(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return clamp(number / 100, 0, 1);
}

function normalise01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return clamp(number, 0, 1);
}

function confidenceLevel(score) {
  if (score >= 85) return "very_high";
  if (score >= 70) return "high";
  if (score >= 55) return "moderate";
  if (score >= 40) return "low";
  return "very_low";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, decimals = 3) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
