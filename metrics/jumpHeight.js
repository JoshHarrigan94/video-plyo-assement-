export function jumpHeightFromFlightTime(flightTimeSec) {
  if (!Number.isFinite(flightTimeSec) || flightTimeSec <= 0) return null;
  const g = 9.80665;
  return (g * flightTimeSec ** 2) / 8;
}
