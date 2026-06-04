export async function assessVideoQuality(analysis) {
  const video = analysis.video || {};
  const flags = [];
  const checks = {};

  checks.hasVideo = Boolean(video.objectUrl);
  checks.hasDuration = isPositive(video.durationSec);
  checks.hasResolution = isPositive(video.width) && isPositive(video.height);
  checks.hasFpsEstimate = isPositive(video.fps);

  checks.resolutionTier = getResolutionTier(video.width, video.height);
  checks.durationTier = getDurationTier(video.durationSec);
  checks.frameRateTier = getFrameRateTier(video.fps);
  checks.orientation = video.orientation || "unknown";
  checks.fileSizeTier = getFileSizeTier(video.fileSizeBytes);

  if (!checks.hasVideo) flags.push("missing_video");
  if (!checks.hasDuration) flags.push("missing_duration");
  if (!checks.hasResolution) flags.push("missing_resolution");
  if (!checks.hasFpsEstimate) flags.push("missing_fps_estimate");

  if (checks.resolutionTier === "low") flags.push("low_resolution");
  if (checks.durationTier === "too_short") flags.push("video_too_short");
  if (checks.durationTier === "too_long") flags.push("video_long_for_browser_processing");
  if (checks.frameRateTier === "low") flags.push("low_frame_rate");
  if (checks.orientation === "unknown") flags.push("unknown_orientation");

  const score = calculateQualityScore(checks, flags);
  const status = getQualityStatus(score, flags);

  analysis.quality = {
    score,
    status,
    flags,
    checks
  };

  analysis.logs.push({
    time: new Date().toISOString(),
    level: flags.length ? "warn" : "info",
    module: "quality",
    message: flags.length
      ? `Video quality assessed with ${flags.length} flag(s).`
      : "Video quality assessed successfully."
  });

  return analysis;
}

function calculateQualityScore(checks, flags) {
  let score = 100;

  if (!checks.hasVideo) score -= 40;
  if (!checks.hasDuration) score -= 15;
  if (!checks.hasResolution) score -= 15;
  if (!checks.hasFpsEstimate) score -= 10;

  if (checks.resolutionTier === "low") score -= 20;
  if (checks.resolutionTier === "medium") score -= 8;
  if (checks.resolutionTier === "unknown") score -= 12;

  if (checks.durationTier === "too_short") score -= 20;
  if (checks.durationTier === "too_long") score -= 8;

  if (checks.frameRateTier === "low") score -= 18;
  if (checks.frameRateTier === "standard") score -= 6;
  if (checks.frameRateTier === "unknown") score -= 10;

  if (flags.includes("missing_video")) score -= 25;

  return clamp(Math.round(score), 0, 100);
}

function getQualityStatus(score, flags) {
  if (flags.includes("missing_video")) return "failed";
  if (score >= 80) return "good";
  if (score >= 60) return "usable_with_caution";
  if (score >= 40) return "poor";
  return "failed";
}

function getResolutionTier(width, height) {
  if (!isPositive(width) || !isPositive(height)) return "unknown";

  const maxSide = Math.max(width, height);
  const minSide = Math.min(width, height);

  if (maxSide >= 1920 && minSide >= 1080) return "high";
  if (maxSide >= 1280 && minSide >= 720) return "medium";
  return "low";
}

function getDurationTier(durationSec) {
  if (!isPositive(durationSec)) return "unknown";
  if (durationSec < 1.5) return "too_short";
  if (durationSec > 90) return "too_long";
  return "usable";
}

function getFrameRateTier(fps) {
  if (!isPositive(fps)) return "unknown";
  if (fps < 24) return "low";
  if (fps < 60) return "standard";
  if (fps < 120) return "high";
  return "very_high";
}

function getFileSizeTier(bytes) {
  if (!isPositive(bytes)) return "unknown";

  const mb = bytes / (1024 * 1024);

  if (mb < 5) return "small";
  if (mb < 100) return "normal";
  if (mb < 500) return "large";
  return "very_large";
}

function isPositive(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
