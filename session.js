export function createAnalysisSession({ file, athlete }) {
  return {
    version: "0.1.0-github",
    createdAt: new Date().toISOString(),
    completedAt: null,
    source: {
      fileName: file?.name || null,
      fileType: file?.type || null,
      fileSizeBytes: file?.size || null
    },
    input: { file, athlete },
    athlete: {},
    video: {},
    audio: {},
    quality: { score: null, flags: [] },
    crop: {},
    pose: { frames: [], landmarks: [], status: "not_started" },
    signals: {},
    audioEvents: [],
    events: {},
    ml: {},
    metrics: {},
    confidence: {},
    errors: [],
    flags: []
  };
}
