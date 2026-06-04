export async function detectMovementEvents(analysis) {
  analysis.events = {
    status: "placeholder",
    contacts: [],
    takeOffs: [],
    landings: [],
    flights: [],
    note: "Next pass: derive event windows from ankle/foot/hip signals and validate with audio impacts."
  };
  return analysis;
}