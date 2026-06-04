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

export async function runPlyoAnalysis(input = {}) {
  let analysis = createAnalysisSession(input);

  analysis = await runStep(analysis, "ingestVideo", ingestVideo);
  analysis = await runStep(analysis, "buildAthleteReference", buildAthleteReference);
  analysis = await runStep(analysis, "assessVideoQuality", assessVideoQuality);
  analysis = await runStep(analysis, "runSmartCrop", runSmartCrop);
  analysis = await runStep(analysis, "runPoseDetection", runPoseDetection);
  analysis = await runStep(analysis, "cleanLandmarks", cleanLandmarks);
  analysis = await runStep(analysis, "extractJointSignals", extractJointSignals);
  analysis = await runStep(analysis, "detectAudioImpacts", detectAudioImpacts);
  analysis = await runStep(analysis, "detectMovementEvents", detectMovementEvents);
  analysis = await runStep(analysis, "refineEventsWithML", refineEventsWithML);
  analysis = await runStep(analysis, "extractMetrics", extractMetrics);
  analysis = await runStep(analysis, "estimateConfidenceAndError", estimateConfidenceAndError);

  analysis.status = analysis.errors.length ? "completed_with_errors" : "completed";
  analysis.updatedAt = new Date().toISOString();

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
