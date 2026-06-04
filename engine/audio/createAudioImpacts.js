export async function detectAudioImpacts(analysis) {
  const useAudio = analysis.input?.options?.useAudio ?? true;

  if (!useAudio) {
    analysis.audio.present = false;
    analysis.audio.quality.flags.push("audio_disabled_by_user");

    analysis.logs.push({
      time: new Date().toISOString(),
      level: "info",
      module: "audio",
      message: "Audio impact detection skipped because audio is disabled."
    });

    return analysis;
  }

  /*
    v0.1 placeholder.

    Future implementation:
    - extract audio from video file
    - decode with Web Audio API
    - calculate waveform energy
    - detect landing/contact spikes
    - align impact timestamps to video time
  */

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
