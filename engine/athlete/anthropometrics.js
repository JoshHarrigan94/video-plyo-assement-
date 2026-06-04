export function estimateAnthropometrics({ heightCm, weightKg, sexGender }) {
  const heightM = heightCm / 100;
  return {
    model: "simple-proportional-v0.1",
    sexGender,
    massKg: weightKg,
    estimatedLegLengthM: round(heightM * 0.53, 3),
    estimatedHipHeightM: round(heightM * 0.53, 3),
    estimatedCOMHeightStandingM: round(heightM * 0.56, 3),
    note: "Placeholder proportional model. Replace with validated segment model later."
  };
}

function round(value, places = 2) {
  const p = 10 ** places;
  return Math.round(value * p) / p;
}
