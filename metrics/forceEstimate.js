export function estimateRelativeForcePlaceholder({ weightKg, accelerationMps2 }) {
  if (!Number.isFinite(weightKg) || !Number.isFinite(accelerationMps2)) return null;
  return weightKg * accelerationMps2;
}
