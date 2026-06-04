export function createManualLabel({ type, timeMs, frameIndex, note = "" }) {
  return { type, timeMs, frameIndex, note, createdAt: new Date().toISOString() };
}
