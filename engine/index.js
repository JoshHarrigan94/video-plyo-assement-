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

export async function runPlyoAnalysis(input) {
  let analysis = createAnalysisSession(input);

  analysis = await ingestVideo(analysis);
  analysis = await buildAthleteReference(analysis);
  analysis = await assessVideoQuality(analysis);
  analysis = await runSmartCrop(analysis);
  analysis = await runPoseDetection(analysis);
  analysis = await cleanLandmarks(analysis);
  analysis = await extractJointSignals(analysis);
  analysis = await detectAudioImpacts(analysis);
  analysis = await detectMovementEvents(analysis);
  analysis = await refineEventsWithML(analysis);
  analysis = await extractMetrics(analysis);
  analysis = await estimateConfidenceAndError(analysis);

  return analysis;
}