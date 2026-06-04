export async function refineEventsWithML(analysis) {
  analysis.ml = {
    status: "placeholder",
    model: null,
    corrections: [],
    note: "Later: estimate sub-frame event timing from trajectory, velocity, pose confidence, audio spike timing and fps."
  };
  return analysis;
}
