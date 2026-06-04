export function addFlag(analysis, flag) {
  if (!analysis.flags.includes(flag)) analysis.flags.push(flag);
  return analysis;
}