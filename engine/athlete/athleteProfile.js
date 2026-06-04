import { estimateAnthropometrics } from "./anthropometrics.js";

export async function buildAthleteReference(analysis) {
  const input = analysis.input.athlete || {};
  const heightCm = Number(input.heightCm);
  const weightKg = Number(input.weightKg);

  if (!Number.isFinite(heightCm) || heightCm <= 0) analysis.flags.push("athlete-height-invalid");
  if (!Number.isFinite(weightKg) || weightKg <= 0) analysis.flags.push("athlete-weight-invalid");

  analysis.athlete = {
    heightCm,
    heightM: heightCm / 100,
    weightKg,
    sexGender: input.sexGender || "not_specified",
    anthropometrics: estimateAnthropometrics({ heightCm, weightKg, sexGender: input.sexGender })
  };

  return analysis;
}