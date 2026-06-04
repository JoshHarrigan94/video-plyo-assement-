export function movingAverage(values, windowSize = 3) {
  return values.map((_, index) => {
    const start = Math.max(0, index - windowSize + 1);
    const slice = values.slice(start, index + 1).filter(Number.isFinite);
    return slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : null;
  });
}
