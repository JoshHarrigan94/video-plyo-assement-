export async function estimateConfidenceAndError(analysis) {
  const flags = [...analysis.flags, ...(analysis.quality.flags || [])];
  const base = analysis.quality.score ?? 50;
  const posePenalty = analysis.pose.status === "placeholder" ? 25 : 0;
  const mlPenalty = analysis.ml.status === "placeholder" ? 10 : 0;

  analysis.confidence = {
    score: Math.max(0, Math.min(100, base - posePenalty - mlPenalty)),
    level: levelFromScore(Math.max(0, Math.min(100, base - posePenalty - mlPenalty))),
    metricErrors: {
      flight_time_ms: null,
      ground_contact_time_ms: null,
      jump_height_cm: null,
      force_estimate: null
    },
    flags,
    note: "v0.1 confidence is scaffold-only. Replace with metric-specific confidence and error models."
  };

  return analysis;
}

function levelFromScore(score) {
  if (score >= 80) return "high";
  if (score >= 55) return "moderate";
  if (score >= 30) return "low";
  return "not_valid";
}
