import { runPlyoAnalysis } from "../engine/index.js";

const form = document.getElementById("analysisForm");
const videoFile = document.getElementById("videoFile");
const videoPreview = document.getElementById("videoPreview");
const output = document.getElementById("output");
const downloadJsonBtn = document.getElementById("downloadJsonBtn");
let lastAnalysis = null;

videoFile.addEventListener("change", () => {
  const file = videoFile.files?.[0];
  if (!file) return;
  videoPreview.src = URL.createObjectURL(file);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = videoFile.files?.[0];
  if (!file) return;

  output.textContent = "Running engine scaffold...";
  downloadJsonBtn.disabled = true;

  const athlete = {
    heightCm: Number(document.getElementById("heightCm").value),
    weightKg: Number(document.getElementById("weightKg").value),
    sexGender: document.getElementById("sexGender").value
  };

  try {
    lastAnalysis = await runPlyoAnalysis({ file, athlete });
    output.textContent = JSON.stringify(lastAnalysis, null, 2);
    downloadJsonBtn.disabled = false;
  } catch (error) {
    output.textContent = JSON.stringify({ error: error.message, stack: error.stack }, null, 2);
  }
});

downloadJsonBtn.addEventListener("click", () => {
  if (!lastAnalysis) return;
  const blob = new Blob([JSON.stringify(lastAnalysis, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `plyo-analysis-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});
