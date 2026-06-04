export async function detectAudioImpacts(analysis) {
  analysis.audioEvents = [];
  analysis.audio.impactDetection = {
    status: "placeholder",
    note: "Next pass: decode audio buffer, detect transient spikes, align impact timestamps to video timeline."
  };
  return analysis;
}
