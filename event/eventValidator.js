export function validateEventAgreement(primaryEvent, validationEvent, toleranceMs = 25) {
  if (!primaryEvent || !validationEvent) return { ok: false, reason: "missing-event" };
  const deltaMs = Math.abs(primaryEvent.timeMs - validationEvent.timeMs);
  return { ok: deltaMs <= toleranceMs, deltaMs, toleranceMs };
}