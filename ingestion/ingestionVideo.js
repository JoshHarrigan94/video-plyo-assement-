export async function ingestVideo(analysis) {
  const file = analysis.input.file;
  if (!file) throw new Error("No video file supplied.");

  const objectUrl = URL.createObjectURL(file);
  const metadata = await readVideoMetadata(objectUrl);

  analysis.video = {
    objectUrl,
    durationSec: metadata.duration,
    width: metadata.videoWidth,
    height: metadata.videoHeight,
    aspectRatio: metadata.videoWidth && metadata.videoHeight ? metadata.videoWidth / metadata.videoHeight : null,
    estimatedFps: null,
    frameCountEstimate: null,
    note: "v0.1 reads browser metadata only. Frame extraction lands in ingestion/extractFrames.js."
  };

  analysis.audio = {
    present: true,
    note: "v0.1 assumes an audio track may exist. Real extraction lands in audio/audioParser.js."
  };

  return analysis;
}

function readVideoMetadata(src) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      resolve({
        duration: Number.isFinite(video.duration) ? video.duration : null,
        videoWidth: video.videoWidth || null,
        videoHeight: video.videoHeight || null
      });
    };
    video.onerror = () => reject(new Error("Could not read video metadata."));
    video.src = src;
  });
}
