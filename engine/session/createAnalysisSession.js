export function createAnalysisSession(input = {}) {
  const now = new Date().toISOString();

  return {
    id: createSessionId(),
    createdAt: now,
    updatedAt: now,

    status: "created",

    input: {
      videoFile: input.videoFile || null,

      athlete: {
        heightCm: toNumber(input.heightCm),
        weightKg: toNumber(input.weightKg),
        sexGender: input.sexGender || "not_specified"
      },

      options: {
        movementType: input.movementType || "unknown",
        useSmartCrop: input.useSmartCrop ?? true,
        useAudio: input.useAudio ?? true,
        useMLRefinement: input.useMLRefinement ?? false
      }
    },

    athlete: {
      reference: null,
      anthropometrics: null,
      scaling: null
    },

    video: {
      fileName: null,
      fileType: null,
      fileSizeBytes: null,
      objectUrl: null,
      durationSec: null,
      width: null,
      height: null,
      fps: null,
      frameCountEstimate: null,
      orientation: null
    },

    audio: {
      present: null,
      sampleRate: null,
      durationSec: null,
      peaks: [],
      impacts: [],
      quality: {
        score: null,
        flags: []
      }
    },

    quality: {
      score: null,
      status: "not_assessed",
      flags: [],
      checks: {}
    },

    crop: {
      enabled: Boolean(input.useSmartCrop ?? true),
      status: "not_run",
      regions: [],
      stabilityScore: null,
      flags: []
    },

    pose: {
      detector: "mediapipe_ready_placeholder",
      status: "not_run",
      landmarksByFrame: [],
      visibility: {
        average: null,
        minimum: null,
        byLandmark: {}
      },
      flags: []
    },

    signals: {
      status: "not_run",
      landmarks: {},
      joints: {},
      velocities: {},
      angles: {},
      quality: {
        score: null,
        flags: []
      }
    },

    events: {
      status: "not_run",
      candidates: [],
      final: [],
      takeOffs: [],
      landings: [],
      contacts: [],
      flags: []
    },

    ml: {
      enabled: Boolean(input.useMLRefinement ?? false),
      status: "not_run",
      model: null,
      refinements: [],
      flags: []
    },

    metrics: {
      status: "not_run",
      values: {},
      registryVersion: "0.1",
      flags: []
    },

    confidence: {
      status: "not_run",
      overall: null,
      byMetric: {},
      errorEstimates: {},
      flags: []
    },

    validation: {
      manualLabels: [],
      comparisons: [],
      errorSummary: null
    },

    logs: [
      {
        time: now,
        level: "info",
        module: "session",
        message: "Analysis session created."
      }
    ],

    errors: []
  };
}

function createSessionId() {
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `plyo_${time}_${random}`;
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}