export async function refineEventsWithML(analysis) {
  const enabled =
    analysis.input?.options?.useMLRefinement ?? false;

  if (!enabled) {
    analysis.ml.status = "disabled";

    analysis.logs.push({
      time: new Date().toISOString(),
      level: "info",
      module: "ml",
      message: "ML refinement disabled."
    });

    return analysis;
  }

  const candidates =
    analysis.events?.candidates || [];

  if (!candidates.length) {
    analysis.ml.status = "skipped";

    analysis.ml.flags.push(
      "ml_refinement_skipped_no_event_candidates"
    );

    analysis.logs.push({
      time: new Date().toISOString(),
      level: "warn",
      module: "ml",
      message: "ML refinement skipped because no event candidates exist."
    });

    return analysis;
  }

  analysis.ml.status = "running";

  /*
    v0.1

    No machine learning yet.

    We are creating the architecture contract.

    Future model inputs:

    - pose trajectories
    - joint velocities
    - event windows
    - audio spikes
    - frame rate
    - athlete scaling

    Future output:

    event timing correction
  */

  const refinements = candidates.map(candidate => ({
    eventId: candidate.id,

    originalTimeSec: candidate.timeSec,

    refinedTimeSec: candidate.timeSec,

    offsetMs: 0,

    confidence: candidate.confidence,

    modelVersion: "placeholder_v0.1",

    flags: [
      "no_ml_model_loaded"
    ]
  }));

  analysis.ml = {
    ...analysis.ml,

    status: "complete",

    model: {
      name: "future_temporal_refinement_model",
      version: "0.1_placeholder"
    },

    refinements
  };

  analysis.events.final =
    candidates.map(candidate => ({
      ...candidate,
      refined: true
    }));

  analysis.logs.push({
    time: new Date().toISOString(),
    level: "info",
    module: "ml",
    message: `ML refinement completed for ${refinements.length} event(s).`
  });

  return analysis;
}
