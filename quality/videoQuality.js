export async function assessVideoQuality(analysis) {
  const flags = [];
  const { width, height, durationSec } = analysis.video;

  if (!width || !height) flags.push("video-resolution-unavailable");
  if (width && height && Math.min(width, height) < 480) flags.push("low-resolution");
  if (durationSec && durationSec < 1) flags.push("video-too-short");

  analysis.quality = {
    score: Math.max(0, 100 - flags.length * 18),
    flags,
    note: "v0.1 quality gate checks metadata only. Blur, lighting, feet visibility and camera stability are next."
  };

  analysis.flags.push(...flags.map(flag => `quality:${flag}`));
  return analysis;
}
