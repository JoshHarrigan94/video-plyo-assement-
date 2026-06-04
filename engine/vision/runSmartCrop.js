export async function runSmartCrop(analysis) {
  analysis.crop.status = "running";

  /*
    v0.1

    No actual cropping yet.

    This module establishes the contract that future
    athlete detection and tracking systems will use.
  */

  analysis.crop = {
    ...analysis.crop,

    status: "complete",

    detector: "placeholder",

    athleteDetected: false,

    cropRegion: null,

    trackedRegions: [],

    stabilityScore: null,

    visibilityScore: null,

    trackingConfidence: null,

    flags: [
      "smart_crop_not_yet_implemented"
    ]
  };

  analysis.logs.push({
    time: new Date().toISOString(),
    level: "info",
    module: "vision",
    message: "Smart crop placeholder executed."
  });

  return analysis;
}
