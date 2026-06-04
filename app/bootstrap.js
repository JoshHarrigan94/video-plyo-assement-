const APP_INFO = {
  name: "Video Plyo Assessment Engine",
  version: "0.1.0",
  build: "bootstrap-pass-1",
  startedAt: new Date().toISOString()
};

window.PLYO_APP = {
  info: APP_INFO,
  boot: {
    status: "starting",
    checks: {},
    errors: [],
    warnings: []
  }
};

installGlobalErrorHandlers();
runBootstrap();

async function runBootstrap() {
  logBoot("info", "bootstrap", "Bootstrap started.");

  const checks = runCapabilityChecks();
  window.PLYO_APP.boot.checks = checks;

  if (checks.blockers.length) {
    failBoot("Browser capability check failed.", checks.blockers);
    return;
  }

  renderBootStatus("Loading application...");

  try {
    const appModule = await import("./main.js");

    if (typeof appModule.startApp === "function") {
      await appModule.startApp({
        appInfo: APP_INFO,
        checks
      });
    } else {
      logBoot("warn", "bootstrap", "main.js does not export startApp(). Using fallback import-only boot.");
    }

    window.PLYO_APP.boot.status = "ready";
    renderBootStatus("Ready.");

    logBoot("info", "bootstrap", "Application boot complete.");
  } catch (error) {
    failBoot("Application module failed to load.", [
      error.message || "Unknown module loading error"
    ]);

    console.error(error);
  }
}

function runCapabilityChecks() {
  const checks = {
    browser: navigator.userAgent,
    secureContext: window.isSecureContext,
    supportsModules: true,
    supportsFileApi: Boolean(window.File && window.FileReader && window.Blob),
    supportsVideo: Boolean(document.createElement("video").canPlayType),
    supportsCanvas: Boolean(document.createElement("canvas").getContext),
    supportsAudioContext: Boolean(window.AudioContext || window.webkitAudioContext),
    supportsPerformanceApi: Boolean(window.performance),
    supportsUrlObjects: Boolean(window.URL && window.URL.createObjectURL),
    supportsMediaPipeGlobal: Boolean(window.MediaPipeVision),
    blockers: [],
    warnings: []
  };

  if (!checks.supportsFileApi) checks.blockers.push("File API is not supported.");
  if (!checks.supportsVideo) checks.blockers.push("HTML video is not supported.");
  if (!checks.supportsCanvas) checks.blockers.push("Canvas is not supported.");
  if (!checks.supportsUrlObjects) checks.blockers.push("Object URLs are not supported.");

  if (!checks.secureContext) {
    checks.warnings.push("Page is not running in a secure context. Some browser APIs may be limited.");
  }

  if (!checks.supportsAudioContext) {
    checks.warnings.push("Web Audio API is not available. Audio impact detection may fail.");
  }

  if (!checks.supportsMediaPipeGlobal) {
    checks.warnings.push("MediaPipe global is not available at bootstrap. Pose detection may fail if the CDN script did not load.");
  }

  for (const warning of checks.warnings) {
    logBoot("warn", "capability", warning);
  }

  return checks;
}

function installGlobalErrorHandlers() {
  window.addEventListener("error", event => {
    const payload = {
      time: new Date().toISOString(),
      type: "window_error",
      message: event.message,
      source: event.filename,
      line: event.lineno,
      column: event.colno,
      stack: event.error?.stack || null
    };

    window.PLYO_APP.boot.errors.push(payload);
    console.error("[PLYO GLOBAL ERROR]", payload);

    renderBootError("Runtime error", payload.message);
  });

  window.addEventListener("unhandledrejection", event => {
    const reason = event.reason;

    const payload = {
      time: new Date().toISOString(),
      type: "unhandled_promise_rejection",
      message: reason?.message || String(reason),
      stack: reason?.stack || null
    };

    window.PLYO_APP.boot.errors.push(payload);
    console.error("[PLYO PROMISE ERROR]", payload);

    renderBootError("Unhandled async error", payload.message);
  });
}

function failBoot(message, details = []) {
  window.PLYO_APP.boot.status = "failed";

  const payload = {
    time: new Date().toISOString(),
    type: "boot_failure",
    message,
    details
  };

  window.PLYO_APP.boot.errors.push(payload);

  renderBootFailure(message, details);

  console.error("[PLYO BOOT FAILURE]", payload);
}

function logBoot(level, module, message) {
  const entry = {
    time: new Date().toISOString(),
    level,
    module,
    message
  };

  if (level === "warn") {
    window.PLYO_APP.boot.warnings.push(entry);
  }

  console[level === "warn" ? "warn" : "log"](
    `[PLYO ${level.toUpperCase()}][${module}] ${message}`
  );
}

function renderBootStatus(message) {
  const status = document.getElementById("bootStatus");
  if (!status) return;

  status.textContent = message;
  status.dataset.state = "ready";
}

function renderBootError(title, message) {
  const status = document.getElementById("bootStatus");
  if (!status) return;

  status.dataset.state = "error";
  status.textContent = `${title}: ${message}`;
}

function renderBootFailure(message, details) {
  const root = document.getElementById("bootStatus");

  const html = `
    <div style="
      border:1px solid rgba(239,68,68,.35);
      background:rgba(239,68,68,.08);
      color:#fecaca;
      padding:12px;
      border-radius:14px;
      line-height:1.45;
      font-size:.88rem;
    ">
      <strong>Boot failed</strong><br />
      ${escapeHtml(message)}
      ${details.length ? `<ul>${details.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
    </div>
  `;

  if (root) {
    root.innerHTML = html;
    root.dataset.state = "error";
  } else {
    document.body.insertAdjacentHTML("afterbegin", html);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}