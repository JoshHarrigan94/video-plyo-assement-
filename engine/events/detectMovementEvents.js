import { getMovementDetector } from "./movementDetectors/index.js";

export async function detectMovementEvents(analysis) {
  const movementType =
    analysis.input?.options?.movementType ||
    analysis.input?.movementType ||
    "generic_jump";

  const joints = analysis.signals?.joints || {};
  const velocities = analysis.signals?.velocities || {};
  const angles = analysis.signals?.angles || {};
  const audioImpacts = analysis.audio?.impacts || [];

  const hasSignals =
    (joints.hipY || []).length &&
    (joints.ankleY || []).length;

  if (!hasSignals) {
    analysis.events.status = "skipped";
    analysis.events.flags.push("event_detection_skipped_no_signals");
    return analysis;
  }

  const detector = getMovementDetector(movementType);

  const result = detector({
    analysis,
    joints,
    velocities,
    angles,
    audioImpacts,
    fps: analysis.video?.fps || 30
  });

  analysis.events = {
    ...analysis.events,
    status: "complete",
    movementType,
    detector: result.detector,
    candidates: result.candidates || [],
    final: result.final || [],
    takeOffs: result.takeOffs || [],
    landings: result.landings || [],
    contacts: result.contacts || [],
    phases: result.phases || [],
    flags: result.flags || []
  };

  analysis.logs.push({
    time: new Date().toISOString(),
    level: "info",
    module: "events",
    message: `Movement detector '${movementType}' completed with ${(result.final || []).length} final event(s).`
  });

  return analysis;
}