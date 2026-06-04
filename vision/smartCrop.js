export async function runSmartCrop(analysis) {
  analysis.crop = {
    status: "placeholder",
    strategy: "athlete-detection-dynamic-crop",
    cropBoxes: [],
    note: "Next pass: detect athlete bounding box, crop around body/feet, then re-run pose detection on crop."
  };
  return analysis;
}
