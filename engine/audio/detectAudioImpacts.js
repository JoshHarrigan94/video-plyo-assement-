export async function detectAudioImpacts(analysis) {
  const useAudio = analysis.input?.options?.useAudio ?? true;
  const file = analysis.input?.videoFile;

  if (!useAudio) {
    analysis.audio.present = false;
    analysis.audio.quality.flags.push("audio_disabled_by_user");
    return analysis;
  }

  if (!file) {
    analysis.audio.present = false;
    analysis.audio.quality.flags.push("audio_skipped_no_video_file");
    return analysis;
  }

  try {
    const audioData = await decodeAudioFromFile(file);
    const energySeries = buildEnergySeries(audioData);
    const impacts = detectImpactPeaks(energySeries);

    analysis.audio = {
      ...analysis.audio,
      present: true,
      sampleRate: audioData.sampleRate,
      durationSec: round(audioData.durationSec, 3),
      peaks: energySeries,
      impacts,
      quality: {
        score: estimateAudioQuality(energySeries, impacts),
        flags: buildAudioFlags(energySeries, impacts)
      }
    };

    analysis.logs.push({
      time: new Date().toISOString(),
      level: "info",
      module: "audio",
      message: `Audio impact detection completed with ${impacts.length} impact candidate(s).`
    });

    return analysis;
  } catch (error) {
    analysis.audio.present = false;

    analysis.audio.quality = {
      score: 0,
      flags: [
        "audio_decode_failed",
        error.message
      ]
    };

    analysis.logs.push({
      time: new Date().toISOString(),
      level: "warn",
      module: "audio",
      message: `Audio impact detection failed: ${error.message}`
    });

    return analysis;
  }
}

async function decodeAudioFromFile(file) {
  const arrayBuffer = await file.arrayBuffer();

  const AudioContextClass =
    window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) {
    throw new Error("Web Audio API not supported in this browser.");
  }

  const audioContext = new AudioContextClass();

  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const channelData =
      audioBuffer.numberOfChannels > 0
        ? audioBuffer.getChannelData(0)
        : null;

    if (!channelData) {
      throw new Error("No audio channel found.");
    }

    return {
      sampleRate: audioBuffer.sampleRate,
      durationSec: audioBuffer.duration,
      samples: channelData
    };
  } finally {
    await audioContext.close();
  }
}

function buildEnergySeries(audioData) {
  const windowMs = 10;
  const samplesPerWindow = Math.max(
    1,
    Math.round(audioData.sampleRate * (windowMs / 1000))
  );

  const series = [];

  for (
    let start = 0;
    start < audioData.samples.length;
    start += samplesPerWindow
  ) {
    const end = Math.min(
      start + samplesPerWindow,
      audioData.samples.length
    );

    let sumSquares = 0;
    let peak = 0;

    for (let i = start; i < end; i++) {
      const sample = audioData.samples[i];
      sumSquares += sample * sample;
      peak = Math.max(peak, Math.abs(sample));
    }

    const count = end - start;
    const rms = Math.sqrt(sumSquares / count);

    series.push({
      index: series.length,
      timeSec: round(start / audioData.sampleRate, 4),
      rms: round(rms, 5),
      peak: round(peak, 5)
    });
  }

  return series;
}

function detectImpactPeaks(series) {
  if (!series.length) return [];

  const rmsValues = series
    .map(item => item.rms)
    .filter(Number.isFinite);

  const baseline = median(rmsValues);
  const highThreshold = Math.max(
    baseline * 4,
    percentile(rmsValues, 92)
  );

  const impacts = [];

  for (let i = 1; i < series.length - 1; i++) {
    const previous = series[i - 1];
    const current = series[i];
    const next = series[i + 1];

    const isPeak =
      current.rms > previous.rms &&
      current.rms > next.rms &&
      current.rms >= highThreshold;

    if (!isPeak) continue;

    const tooClose = impacts.some(
      impact => Math.abs(impact.timeSec - current.timeSec) < 0.12
    );

    if (tooClose) continue;

    impacts.push({
      id: `audio_impact_${impacts.length + 1}`,
      timeSec: current.timeSec,
      rms: current.rms,
      peak: current.peak,
      confidence: estimateImpactConfidence(current, baseline, highThreshold),
      source: "audio_rms_peak",
      flags: ["audio_candidate"]
    });
  }

  return impacts;
}

function estimateImpactConfidence(impact, baseline, threshold) {
  if (!Number.isFinite(impact.rms) || !Number.isFinite(baseline)) {
    return 0.25;
  }

  const ratio = baseline > 0
    ? impact.rms / baseline
    : impact.rms / Math.max(threshold, 0.00001);

  if (ratio >= 10) return 0.9;
  if (ratio >= 7) return 0.8;
  if (ratio >= 5) return 0.7;
  if (ratio >= 3) return 0.55;

  return 0.4;
}

function estimateAudioQuality(series, impacts) {
  if (!series.length) return 0;

  let score = 65;

  if (impacts.length) score += 20;
  if (impacts.length > 20) score -= 15;

  const rmsValues = series
    .map(item => item.rms)
    .filter(Number.isFinite);

  const baseline = median(rmsValues);
  const p95 = percentile(rmsValues, 95);

  if (baseline > 0 && p95 / baseline > 4) {
    score += 10;
  }

  return clamp(Math.round(score), 0, 100);
}

function buildAudioFlags(series, impacts) {
  const flags = ["audio_detection_v0_1"];

  if (!series.length) flags.push("no_audio_energy_series");
  if (!impacts.length) flags.push("no_audio_impacts_detected");
  if (impacts.length > 20) flags.push("many_audio_impacts_detected_possible_noise");

  return flags;
}

function median(values) {
  return percentile(values, 50);
}

function percentile(values, p) {
  const clean = values
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  if (!clean.length) return 0;

  const index = Math.floor((p / 100) * (clean.length - 1));
  return clean[index];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, decimals = 3) {
  const number = Number(value);

  if (!Number.isFinite(number)) return null;

  const factor = Math.pow(10, decimals);
  return Math.round(number * factor) / factor;
}