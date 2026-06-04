export function compareDetectedToManual(detected = [], manual = []) {
  return {
    detectedCount: detected.length,
    manualCount: manual.length,
    matches: [],
    note: "Implement nearest-neighbour event matching with tolerance windows."
  };
}
