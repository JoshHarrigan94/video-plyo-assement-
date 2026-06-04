import { runPlyoAnalysis } from "../engine/index.js";

const form = document.getElementById("analysisForm");
const videoFileInput = document.getElementById("videoFile");
const videoPreview = document.getElementById("videoPreview");
const output = document.getElementById("output");
const downloadJsonBtn = document.getElementById("downloadJsonBtn");

let latestAnalysis = null;
let latestVideoUrl = null;

videoFileInput.addEventListener("change", () => {
  const file = videoFileInput.files?.[0];

  if (!file) return;

  if (latestVideoUrl) {
    URL.revokeObjectURL(latestVideoUrl);
  }

  latestVideoUrl = URL.createObjectURL(file);
  videoPreview.src = latestVideoUrl;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const videoFile = videoFileInput.files?.[0];

  if (!videoFile) {
    output.textContent = "Please upload a video first.";
    return;
  }

  output.textContent = "Running analysis scaffold...";

  downloadJsonBtn.disabled = true;

  try {
    const input = {
      videoFile,
      heightCm: document.getElementById("heightCm").value,
      weightKg: document.getElementById("weightKg").value,
      sexGender: document.getElementById("sexGender").value,

      options: {
        useSmartCrop: true,
        useAudio: true,
        useMLRefinement: false
      }
    };

    latestAnalysis = await runPlyoAnalysis(input);

    output.textContent = JSON.stringify(latestAnalysis, null, 2);

    downloadJsonBtn.disabled = false;
  } catch (error) {
    console.error(error);

    output.textContent = JSON.stringify(
      {
        status: "failed",
        message: error.message
      },
      null,
      2
    );
  }
});

downloadJsonBtn.addEventListener("click", () => {
  if (!latestAnalysis) return;

  const blob = new Blob(
    [JSON.stringify(latestAnalysis, null, 2)],
    {
      type: "application/json"
    }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `${latestAnalysis.id || "plyo-analysis"}.json`;
  link.click();

  URL.revokeObjectURL(url);
});
