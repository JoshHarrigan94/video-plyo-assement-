export function alignAudioToVideo({ audioEvents = [], videoEvents = [] }) {
  return {
    offsetMs: 0,
    audioEvents,
    videoEvents,
    note: "Placeholder sync assumes browser video/audio timeline alignment."
  };
}