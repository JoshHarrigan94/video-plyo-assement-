export async function ingestVideo(analysis) {
  const file = analysis?.input?.videoFile;

  if (!file) {
    return addError(analysis, "ingestion", "No video file was provided.");
  }

  const objectUrl = URL.createObjectURL(file);

  analysis.video.fileName = file.name || "unknown";
  analysis.video.fileType = file.type || "unknown";
  analysis.video.fileSizeBytes = file.size || null;
  analysis.video.objectUrl = objectUrl;

  try {
    const metadata = await readVideoMetadata(objectUrl);

    analysis.video.durationSec = metadata.durationSec;
    analysis.video.width = metadata.width;
    analysis.video.height = metadata.height;
    analysis.video.orientation = metadata.orientation;
    analysis.video.frameCountEstimate = metadata.frameCountEstimate;
    analysis.video.fps = metadata.fps;

    analysis.status = "video_ingested";

    analysis.logs.push({
      time: new Date().toISOString(),
      level: "info",
      module: "ingestion",
      message: "Video metadata extracted."
    });

    return analysis;
  } catch (error) {
    return addError(
      analysis,
      "ingestion",
      `Video ingestion failed: ${error.message}`
    );
  }
}

function readVideoMetadata(objectUrl) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      const durationSec = Number.isFinite(video.duration)
        ? video.duration
        : null;

      const width = video.videoWidth || null;
      const height = video.videoHeight || null;

      const orientation =
        width && height
          ? width >= height
            ? "landscape"
            : "portrait"
          : "unknown";

      const fps = 30;

      const frameCountEstimate =
        durationSec && fps ? Math.round(durationSec * fps) : null;

      resolve({
        durationSec,
        width,
        height,
        orientation,
        fps,
        frameCountEstimate
      });
    };

    video.onerror = () => {
      reject(new Error("Unable to load video metadata."));
    };

    video.src = objectUrl;
  });
}

function addError(analysis, module, message) {
  analysis.errors.push({
    time: new Date().toISOString(),
    module,
    message
  });

  analysis.logs.push({
    time: new Date().toISOString(),
    level: "error",
    module,
    message
  });

  analysis.status = "error";

  return analysis;
}
