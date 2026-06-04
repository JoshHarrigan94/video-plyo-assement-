import { createAnalysisSession } from "./session/createAnalysisSession.js";
import { ingestVideo } from "./ingestion/ingestVideo.js";
import { buildAthleteReference } from "./athlete/buildAthleteReference.js";
import { assessVideoQuality } from "./quality/assessVideoQuality.js";
import { runSmartCrop } from "./vision/runSmartCrop.js";
import { runPoseDetection } from "./vision/runPoseDetection.js";
import { cleanLandmarks } from "./vision/cleanLandmarks.js";
import { extractJointSignals } from "./signals/extractJointSignals.js";
import { detectAudioImpacts } from "./audio/detectAudioImpacts.js";
import { detectMovementEvents } from "./events/detectMovementEvents.js";
import { refineEventsWithML } from "./ml/refineEventsWithML.js";
import { extractMetrics } from "./metrics/extractMetrics.js";
import { estimateConfidenceAndError } from "./confidence/estimateConfidenceAndError.js";

const PIPELINE = [
  ["ingestVideo", "Reading video metadata", ingestVideo],
  ["buildAthleteReference", "Building athlete reference", buildAthleteReference],
  ["assessVideoQuality", "Checking video quality", assessVideoQuality],
  ["runSmartCrop", "Preparing smart crop layer", runSmartCrop],
  ["runPoseDetection", "Running MediaPipe pose detection", runPoseDetection],
  ["cleanLandmarks", "Cleaning landmarks", cleanLandmarks],
  ["extractJointSignals", "Extracting joint signals", extractJointSignals],
  ["detectAudioImpacts", "Detecting audio impacts", detectAudioImpacts],
  ["detectMovementEvents", "Detecting movement events", detectMovementEvents],
  ["refineEventsWithML", "Running temporal refinement layer", refineEventsWithML],
  ["extractMetrics", "Extracting metrics", extractMetrics],
  ["estimateConfidenceAndError", "Estimating confidence and error", estimateConfidenceAndError]
];

export async function runPlyoAnalysis(input = {}, options = {}) {
  let analysis = createAnalysisSession(input);

  for (let i = 0; i < PIPELINE.length; i++) {
    const [stepName, message, stepFn] = PIPELINE[i];

    options.onProgress?.({
      step: stepName,
      message,
      percent: (i / PIPELINE.length) * 100
    });

    analysis = await runStep(analysis, stepName, stepFn);
  }

  analysis.status = analysis.errors.length ? "completed_with_errors" : "completed";
  analysis.updatedAt = new Date().toISOString();

  options.onProgress?.({
    step: "complete",
    message: "Analysis complete",
    percent: 100
  });

  return analysis;
}

async function runStep(analysis, stepName, stepFn) {
  const startedAt = performance.now();

  try {
    analysis.logs.push({
      time: new Date().toISOString(),
      level: "info",
      module: "pipeline",
      message: `Starting step: ${stepName}`
    });

    const nextAnalysis = await stepFn(analysis);

    nextAnalysis.logs.push({
      time: new Date().toISOString(),
      level: "info",
      module: "pipeline",
      message: `Completed step: ${stepName}`,
      durationMs: Math.round(performance.now() - startedAt)
    });

    nextAnalysis.updatedAt = new Date().toISOString();

    return nextAnalysis;
  } catch (error) {
    analysis.errors.push({
      time: new Date().toISOString(),
      module: stepName,
      message: error.message || "Unknown pipeline error"
    });

    analysis.logs.push({
      time: new Date().toISOString(),
      level: "error",
      module: "pipeline",
      message: `Failed step: ${stepName}`
    });

    analysis.updatedAt = new Date().toISOString();

    return analysis;
  }
}