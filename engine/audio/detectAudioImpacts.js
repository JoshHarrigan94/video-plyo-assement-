export async function detectAudioImpacts(analysis) {
  const useAudio =
    analysis.input?.options?.useAudio ?? true;

  if (!useAudio) {
    analysis.audio.present = false;

    analysis.audio.quality.flags.push(
      "audio_disabled_by_user"
    );

    return analysis;
  }

  analysis.audio.present = null;
  analysis.audio.impacts = [];
  analysis.audio.peaks = [];

  analysis.audio.quality = {
    score: null,
    flags: [
      "audio_decode_not_yet_implemented",
      "impact_detection_not_yet_implemented"
    ]
  };

  analysis.logs.push({
    time: new Date().toISOString(),
    level: "info",
    module: "audio",
    message: "Audio impact detection placeholder executed."
  });

  return analysis;
}
