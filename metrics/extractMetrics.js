import { metricRegistry } from "./metricRegistry.js";

export async function extractMetrics(analysis) {
  analysis.metrics = {
    registry: metricRegistry,
    values: {
      contact_count: null,
      flight_time: null,
      ground_contact_time: null,
      jump_height: null,
      rsi: null,
      estimated_peak_force: null
    },
    note: "Metric values remain null until event detection is implemented."
  };
  return analysis;
}
